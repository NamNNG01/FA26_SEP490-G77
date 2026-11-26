package com.examprep.services;

import com.examprep.dto.attempt.AttemptRequests;
import com.examprep.dto.attempt.AttemptResponses;
import com.examprep.dto.attempt.Snapshots;
import com.examprep.entities.AttemptAnswer;
import com.examprep.entities.ExamAttempt;
import com.examprep.exceptions.ForbiddenException;
import com.examprep.exceptions.ResourceConflictException;
import com.examprep.exceptions.ResourceNotFoundException;
import com.examprep.repositories.AttemptAnswerRepository;
import com.examprep.repositories.ExamAttemptRepository;
import com.examprep.util.attempt.AnswerResponseValidator;
import com.examprep.util.attempt.AttemptScoring;
import com.fasterxml.jackson.databind.JsonNode;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;

/**
 * The transactional write path of the student attempt APIs: SA-03 (batch draft save) and SA-04
 * (submit). Both lock the attempt row first so a save and a submit of the same attempt can never
 * interleave (spec 6.4: "single transaction, lock attempt with FOR UPDATE").
 */
@Component
@RequiredArgsConstructor
public class AttemptWriter {

    private static final String STATUS_IN_PROGRESS = "IN_PROGRESS";
    private static final String TYPE_CODE = "CODE";

    private final ExamAttemptRepository attempts;
    private final AttemptAnswerRepository answers;
    private final AttemptPaperFactory paperFactory;
    private final AttemptAutoSubmitter autoSubmitter;
    private final CodeAnswerJudge judge;
    private final PlatformTransactionManager transactionManager;

    /** One normalized draft entry of either request body. */
    private record Entry(Long questionId, Integer seq, JsonNode response) {
    }

    /**
     * SA-03. Locks the attempt, validates every entry against its frozen display snapshot and
     * stores the ones that are newer than what is already saved.
     *
     * @return the per-entry outcome, or <strong>empty when the deadline had already passed</strong>:
     * in that case the caller closes the attempt before returning {@code 410 ATTEMPT_EXPIRED}.
     */
    @Transactional
    public Optional<AttemptResponses.DraftSaved> saveDrafts(Long userId, Long attemptId, AttemptRequests.DraftSave body) {
        ExamAttempt attempt = lockedOwnedAttempt(userId, attemptId);
        if (!STATUS_IN_PROGRESS.equals(attempt.getStatus())) {
            throw new ResourceConflictException("Attempt has already been submitted");
        }
        Instant now = Instant.now();
        if (autoSubmitter.isExpired(attempt, now)) {
            return Optional.empty();
        }
        if (autoSubmitter.codeJudgingInProgress(attempt, now)) {
            throw new ResourceConflictException("Code judging is already in progress");
        }

        List<AttemptAnswer> rows = answers.findByAttemptIdOrdered(attemptId);
        List<AttemptResponses.Saved> saved = new ArrayList<>();
        List<AttemptResponses.Rejected> rejected = new ArrayList<>();
        apply(rows, entries(body), saved, rejected);
        return Optional.of(new AttemptResponses.DraftSaved(
                List.copyOf(saved), List.copyOf(rejected), attempt.getDeadlineAt()));
    }

    /**
     * SA-04. Already submitted → the current result is returned without grading again (spec 6.4
     * rule 1). Otherwise the optional answers are applied like SA-03, every answer is graded and
     * the attempt is closed.
     *
     * <p>Past {@code deadlineAt + 5s} the answers carried by the request are <em>not</em> applied:
     * only what was saved as a draft in time counts (spec 6.3 — a late submit still answers with
     * the graded result, marked {@code autoSubmitted}, but it must never award points for answers
     * that arrived after the deadline).</p>
     */
    public AttemptResponses.Submitted submit(Long userId, Long attemptId, AttemptRequests.Submit body) {
        List<Entry> entries = submitEntries(body);
        if (!autoSubmitter.close(attemptId, userId, Instant.now(), false,
                entries.isEmpty() ? null : rows -> apply(rows, entries, null, null))) {
            throw new ResourceConflictException("Code judging is already in progress");
        }
        TransactionTemplate readTx = new TransactionTemplate(transactionManager);
        readTx.setReadOnly(true);
        return readTx.execute(status -> {
            ExamAttempt attempt = attempts.findById(attemptId)
                    .orElseThrow(() -> new ResourceNotFoundException("Attempt not found"));
            if (!Objects.equals(attempt.getUser().getUserId(), userId)) {
                throw new ForbiddenException("Attempt belongs to another student");
            }
            return submitted(attempt, answers.findByAttemptIdOrdered(attemptId));
        });
    }

    private ExamAttempt lockedOwnedAttempt(Long userId, Long attemptId) {
        ExamAttempt attempt = attempts.lockById(attemptId)
                .orElseThrow(() -> new ResourceNotFoundException("Attempt not found"));
        if (!Objects.equals(attempt.getUser().getUserId(), userId)) {
            throw new ForbiddenException("Attempt belongs to another student");
        }
        return attempt;
    }

    /**
     * Applies draft entries to the loaded rows. Outcomes are collected only when the caller wants
     * them (SA-03); SA-04 passes {@code null} and silently ignores unknown or malformed entries.
     */
    private void apply(List<AttemptAnswer> rows,
                       List<Entry> entries,
                       List<AttemptResponses.Saved> savedOut,
                       List<AttemptResponses.Rejected> rejectedOut) {
        Map<Long, AttemptAnswer> byQuestion = new HashMap<>();
        for (AttemptAnswer row : rows) {
            byQuestion.put(row.getQuestion().getQuestionId(), row);
        }
        for (Entry entry : entries) {
            if (entry.questionId() == null) {
                continue;
            }
            AttemptAnswer row = byQuestion.get(entry.questionId());
            if (row == null) {
                reject(rejectedOut, entry.questionId(),
                        AttemptResponses.REASON_NOT_IN_ATTEMPT, "Question is not part of this attempt");
                continue;
            }
            // CD-05 judged the exact submitted source; a later SA-03 draft must not detach it.
            Snapshots.DisplayQuestion display =
                    paperFactory.read(row.getDisplaySnapshot(), Snapshots.DisplayQuestion.class);
            String type = paperFactory.questionType(row, display);
            if (row.getGradedAt() != null && TYPE_CODE.equals(type)) {
                reject(rejectedOut, entry.questionId(), AttemptResponses.REASON_ALREADY_GRADED,
                        "Coding answers are final once judged");
                continue;
            }
            if (Boolean.TRUE.equals(row.getIsLocked())) {
                reject(rejectedOut, entry.questionId(), AttemptResponses.REASON_LOCKED,
                        "Question answer is locked");
                continue;
            }
            Optional<String> error = AnswerResponseValidator.validate(type, entry.response(), display);
            if (error.isEmpty() && TYPE_CODE.equals(type)) {
                error = judge.draftLanguageError(entry.questionId(), entry.response());
            }
            if (error.isPresent()) {
                reject(rejectedOut, entry.questionId(),
                        AttemptResponses.REASON_INVALID_RESPONSE, error.get());
                continue;
            }
            if (savedOut != null && (entry.seq() == null || entry.seq() < 0)) {
                reject(rejectedOut, entry.questionId(),
                        AttemptResponses.REASON_INVALID_RESPONSE, "seq must be >= 0");
                continue;
            }
            Integer current = row.getDraftSeq();
            if (entry.seq() != null && current != null && current >= entry.seq()) {
                // Older or equal sequence: ignore, report the draft that is actually stored.
                if (savedOut != null) {
                    savedOut.add(new AttemptResponses.Saved(entry.questionId(), current));
                }
                continue;
            }
            if (TYPE_CODE.equals(type)) {
                row.setResponse(codeResponse(entry.questionId(), entry.response()));
            } else {
                row.setResponse(store(entry.response()));
            }
            if (entry.seq() != null) {
                row.setDraftSeq(entry.seq());
            }
            if (savedOut != null) {
                savedOut.add(new AttemptResponses.Saved(entry.questionId(), row.getDraftSeq()));
            }
        }
    }

    private String codeResponse(Long questionId, JsonNode response) {
        if (response == null || response.path("text").asText("").isBlank()) {
            return null;
        }
        if (response.hasNonNull("language")) {
            return store(response);
        }
        com.fasterxml.jackson.databind.node.ObjectNode code = response.deepCopy();
        code.put("language", judge.language(questionId));
        return store(code);
    }

    private void reject(List<AttemptResponses.Rejected> out, Long questionId, String reason, String detail) {
        if (out != null) {
            out.add(new AttemptResponses.Rejected(questionId, reason, detail));
        }
    }

    /** Empty payloads (and a missing payload) mean "no answer": the column goes back to null. */
    private String store(JsonNode response) {
        if (AnswerResponseValidator.isEmpty(response)) {
            return null;
        }
        return paperFactory.writeResponse(response);
    }

    private List<Entry> entries(AttemptRequests.DraftSave body) {
        List<Entry> entries = new ArrayList<>();
        if (body != null && body.answers() != null) {
            for (AttemptRequests.DraftSave.Draft draft : body.answers()) {
                if (draft != null) {
                    entries.add(new Entry(draft.questionId(), draft.seq(), draft.response()));
                }
            }
        }
        return entries;
    }

    private List<Entry> submitEntries(AttemptRequests.Submit body) {
        List<Entry> entries = new ArrayList<>();
        if (body != null && body.answers() != null) {
            for (AttemptRequests.Submit.Draft draft : body.answers()) {
                if (draft != null) {
                    entries.add(new Entry(draft.questionId(), draft.seq(), draft.response()));
                }
            }
        }
        return entries;
    }

    private AttemptResponses.Submitted submitted(ExamAttempt attempt, List<AttemptAnswer> rows) {
        Snapshots.ExamSnapshot exam = paperFactory.read(attempt.getExamSnapshot(), Snapshots.ExamSnapshot.class);
        BigDecimal maxScore = exam != null && exam.maxScore() != null
                ? exam.maxScore()
                : (attempt.getExam() != null && attempt.getExam().getMaxScore() != null
                        ? attempt.getExam().getMaxScore()
                        : BigDecimal.ZERO);
        BigDecimal totalWeight = BigDecimal.ZERO;
        BigDecimal pendingWeight = BigDecimal.ZERO;
        for (AttemptAnswer row : rows) {
            BigDecimal weight = row.getWeightSnapshot();
            if (weight == null || weight.signum() <= 0) {
                continue;
            }
            totalWeight = totalWeight.add(weight);
            if (row.getScoreEarned() == null) {
                pendingWeight = pendingWeight.add(weight);
            }
        }
        BigDecimal pendingPoints = AttemptScoring.output(
                AttemptScoring.pendingPoints(pendingWeight, totalWeight, maxScore));
        return new AttemptResponses.Submitted(
                attempt.getAttemptId(),
                attempt.getStatus(),
                AttemptScoring.output(attempt.getTotalScore()),
                pendingPoints,
                AttemptScoring.output(maxScore),
                attempt.getAutoSubmitted(),
                attempt.getSubmittedAt(),
                attempt.getTakeAs());
    }
}
