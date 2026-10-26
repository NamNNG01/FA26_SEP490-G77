package com.examprep.services;

import com.examprep.dto.ResponseCode;
import com.examprep.dto.attempt.AttemptRequests;
import com.examprep.dto.attempt.AttemptResponses;
import com.examprep.dto.attempt.Snapshots;
import com.examprep.entities.AttemptAnswer;
import com.examprep.entities.ExamAttempt;
import com.examprep.exceptions.BaseException;
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
import org.springframework.transaction.annotation.Transactional;

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
 * interleave (spec 6.4: "một transaction, khóa bài bằng FOR UPDATE").
 */
@Component
@RequiredArgsConstructor
public class AttemptWriter {

    private static final String STATUS_IN_PROGRESS = "IN_PROGRESS";

    private final ExamAttemptRepository attempts;
    private final AttemptAnswerRepository answers;
    private final AttemptPaperFactory paperFactory;
    private final AttemptAutoSubmitter autoSubmitter;

    /** One normalized draft entry of either request body. */
    private record Entry(Long questionId, Integer seq, JsonNode response) {
    }

    /**
     * SA-03. Locks the attempt, validates every entry against its frozen display snapshot and
     * stores the ones that are newer than what is already saved.
     *
     * @return the per-entry outcome, or <strong>empty when the deadline had already passed</strong>:
     * in that case the attempt has just been auto-submitted inside this transaction and the
     * caller must answer {@code 410 ATTEMPT_EXPIRED}.
     */
    @Transactional
    public Optional<AttemptResponses.DraftSaved> saveDrafts(Long userId, Long attemptId, AttemptRequests.DraftSave body) {
        ExamAttempt attempt = lockedOwnedAttempt(userId, attemptId);
        if (!STATUS_IN_PROGRESS.equals(attempt.getStatus())) {
            throw new ResourceConflictException("Attempt has already been submitted");
        }
        Instant now = Instant.now();
        List<AttemptAnswer> rows = answers.findByAttemptIdOrdered(attemptId);
        if (autoSubmitter.isExpired(attempt, now)) {
            autoSubmitter.gradeAndClose(attempt, rows, now);
            return Optional.empty();
        }

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
     */
    @Transactional
    public AttemptResponses.Submitted submit(Long userId, Long attemptId, AttemptRequests.Submit body) {
        ExamAttempt attempt = lockedOwnedAttempt(userId, attemptId);
        List<AttemptAnswer> rows = answers.findByAttemptIdOrdered(attemptId);
        if (STATUS_IN_PROGRESS.equals(attempt.getStatus())) {
            if (body != null && body.answers() != null && !body.answers().isEmpty()) {
                apply(rows, submitEntries(body), null, null);
            }
            autoSubmitter.gradeAndClose(attempt, rows, Instant.now());
        }
        return submitted(attempt, rows);
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
            Snapshots.DisplayQuestion display =
                    paperFactory.read(row.getDisplaySnapshot(), Snapshots.DisplayQuestion.class);
            Optional<String> error = AnswerResponseValidator.validate(
                    display != null ? display.questionType() : null, entry.response(), display);
            if (error.isPresent()) {
                reject(rejectedOut, entry.questionId(),
                        AttemptResponses.REASON_INVALID_RESPONSE, error.get());
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
            row.setResponse(store(entry.response()));
            if (entry.seq() != null) {
                row.setDraftSeq(entry.seq());
            }
            if (savedOut != null) {
                savedOut.add(new AttemptResponses.Saved(entry.questionId(), row.getDraftSeq()));
            }
        }
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
                : attempt.getExam().getMaxScore() != null ? attempt.getExam().getMaxScore() : BigDecimal.ZERO;
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
                attempt.getSubmittedAt());
    }
}
