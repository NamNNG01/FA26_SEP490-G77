package com.examprep.services;

import com.examprep.dto.attempt.Snapshots;
import com.examprep.entities.AttemptAnswer;
import com.examprep.entities.Exam;
import com.examprep.entities.ExamAttempt;
import com.examprep.exceptions.ForbiddenException;
import com.examprep.exceptions.ResourceNotFoundException;
import com.examprep.repositories.AttemptAnswerRepository;
import com.examprep.repositories.ExamAttemptRepository;
import com.examprep.services.student.QuestionReviewRecorder;
import com.examprep.util.attempt.AnswerResponseValidator;
import com.examprep.util.attempt.AttemptGrader;
import com.examprep.util.attempt.AttemptScoring;
import com.fasterxml.jackson.databind.JsonNode;
import jakarta.annotation.PreDestroy;
import jakarta.persistence.EntityManager;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.PageRequest;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.function.Consumer;

/**
 * Grades and closes an attempt (spec 6.4 rules 3-5, 6.3 "410 ATTEMPT_EXPIRED").
 *
 * <p>Sandbox judging happens between transactions. A final attempt lock protects the write
 * and verifies that the judged source still matches the saved draft.</p>
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class AttemptAutoSubmitter {

    /** Past {@code deadlineAt} the student may still save (spec 6.3: 410 past deadline + 5s). */
    public static final long EXPIRY_GRACE_SECONDS = 5;
    private static final long CODE_JUDGING_LEASE_SECONDS = 600;
    private static final Set<String> UNTIMED_MODES = Set.of("PRACTICE", "SMART_PRACTICE", "MATERIAL_QUIZ", "REVIEW");

    private static final String STATUS_SUBMITTED = "SUBMITTED";
    private static final String STATUS_COMPLETED = "COMPLETED";
    private static final String GRADING_AUTO = "AUTO";
    private static final String GRADING_PENDING_AI = "PENDING_AI";

    private final AttemptPaperFactory paperFactory;
    private final QuestionReviewRecorder reviews;
    private final AttemptAnswerRepository answers;
    private final ExamAttemptRepository attempts;
    private final CodeAnswerJudge judge;
    private final EntityManager entityManager;
    private final PlatformTransactionManager transactionManager;
    private final ExecutorService expiredPool = Executors.newFixedThreadPool(4, task -> {
        Thread thread = new Thread(task, "code-auto-submit");
        thread.setDaemon(true);
        return thread;
    });

    @PreDestroy
    void shutdown() {
        expiredPool.shutdownNow();
    }

    /** True past {@code deadlineAt + 5s}: from then on the server refuses further saves. */
    public boolean isExpired(ExamAttempt attempt, Instant now) {
        if (attempt == null) {
            return false;
        }
        String mode = attempt.getMode();
        if (mode != null && UNTIMED_MODES.contains(mode)) {
            if (!"MATERIAL_QUIZ".equals(mode) || !"EXAM".equals(attempt.getTakeAs())) {
                return false;
            }
        }
        Exam exam = attempt.getExam();
        if (exam != null && exam.getDurationMinutes() == null) {
            return false;
        }
        return attempt.getDeadlineAt() != null
                && now.isAfter(attempt.getDeadlineAt().plusSeconds(EXPIRY_GRACE_SECONDS));
    }

    public boolean codeJudgingInProgress(ExamAttempt attempt, Instant now) {
        return attempt.getCodeJudgingUntil() != null && now.isBefore(attempt.getCodeJudgingUntil());
    }

    boolean hasUngradedCode(List<AttemptAnswer> rows) {
        return rows.stream().anyMatch(row -> (row.getGradedAt() == null || row.getScoreEarned() == null)
                && row.getResponse() != null && judge.isCode(row) && !judge.source(row).isBlank());
    }

    public void closeExpired(Long attemptId, Long userId, Instant now) {
        close(attemptId, userId, now, true, null);
    }

    @Scheduled(initialDelayString = "${app.code-exam.auto-submit-ms:15000}",
            fixedDelayString = "${app.code-exam.auto-submit-ms:15000}")
    public void closeExpiredCodeAttempts() {
        Instant now = Instant.now();
        List<Long> due = attempts.findExpiredCodeAttemptIds(now.minusSeconds(EXPIRY_GRACE_SECONDS), now,
                PageRequest.of(0, 25));
        if (due.isEmpty()) {
            return;
        }
        // Keep single items or @Transactional test calls on the caller thread; fan out scheduled batches concurrently.
        if (due.size() == 1 || TransactionSynchronizationManager.isActualTransactionActive()) {
            for (Long id : due) {
                closeExpiredSafe(id, now);
            }
            return;
        }
        List<CompletableFuture<Void>> futures = due.stream()
                .map(id -> CompletableFuture.runAsync(() -> closeExpiredSafe(id, now), expiredPool))
                .toList();
        CompletableFuture.allOf(futures.toArray(CompletableFuture[]::new)).join();
    }

    private void closeExpiredSafe(Long id, Instant now) {
        try {
            closeExpired(id, null, now);
        } catch (RuntimeException ex) {
            log.error("Auto-submitting code attempt {} failed", id, ex);
        }
    }

    boolean close(Long attemptId, Long userId, Instant submittedAt, boolean expiredOnly,
                  Consumer<List<AttemptAnswer>> applyDrafts) {
        TransactionTemplate tx = new TransactionTemplate(transactionManager);
        CloseStep step = tx.execute(status -> prepareClose(attemptId, userId, submittedAt, expiredOnly,
                applyDrafts, null, List.of(), Map.of()));
        UUID ownerToken = step.token();
        try {
            while (!step.done() && !step.deferred()) {
                List<CodeAnswerJudge.Plan> plans = step.plans();
                Map<Long, CodeAnswerJudge.Verdict> verdicts = judge.judge(plans, true);
                final UUID currentToken = ownerToken;
                step = tx.execute(status -> prepareClose(attemptId, userId, submittedAt, expiredOnly, null,
                        currentToken, plans, verdicts));
                if (step.token() != null) {
                    ownerToken = step.token();
                }
            }
            return !step.deferred();
        } finally {
            if (ownerToken != null && (step == null || !step.done())) {
                final UUID releaseToken = ownerToken;
                try {
                    tx.executeWithoutResult(status -> releaseJudgingIfOwned(attemptId, releaseToken));
                } catch (RuntimeException cleanupEx) {
                    log.warn("Failed to release code judging lock for attempt {}", attemptId, cleanupEx);
                }
            }
        }
    }

    private record CloseStep(boolean done, boolean deferred, UUID token, List<CodeAnswerJudge.Plan> plans) {}

    private void releaseJudgingIfOwned(Long attemptId, UUID ownerToken) {
        ExamAttempt attempt = attempts.lockById(attemptId).orElse(null);
        if (attempt == null) {
            return;
        }
        entityManager.refresh(attempt);
        if (ownerToken.equals(attempt.getCodeJudgingToken())) {
            attempt.setCodeJudgingToken(null);
            attempt.setCodeJudgingUntil(null);
            attempts.flush();
        }
    }

    private CloseStep prepareClose(Long attemptId, Long userId, Instant submittedAt, boolean expiredOnly,
                                   Consumer<List<AttemptAnswer>> applyDrafts, UUID ownerToken,
                                   List<CodeAnswerJudge.Plan> judged, Map<Long, CodeAnswerJudge.Verdict> verdicts) {
        ExamAttempt attempt = attempts.lockById(attemptId).orElse(null);
        if (attempt == null) {
            if (userId == null) {
                return new CloseStep(true, false, null, List.of());
            }
            throw new ResourceNotFoundException("Attempt not found");
        }
        entityManager.refresh(attempt);
        if (userId != null && !Objects.equals(attempt.getUser().getUserId(), userId)) {
            throw new ForbiddenException("Attempt belongs to another student");
        }
        boolean expired = isExpired(attempt, submittedAt);
        if (!"IN_PROGRESS".equals(attempt.getStatus()) || (expiredOnly && !expired)) {
            return new CloseStep(true, false, null, List.of());
        }
        if (ownerToken == null) {
            if (codeJudgingInProgress(attempt, Instant.now())) {
                return new CloseStep(false, true, null, List.of());
            }
        } else if (!ownerToken.equals(attempt.getCodeJudgingToken())) {
            return new CloseStep(false, true, null, List.of());
        }

        List<AttemptAnswer> rows = answers.findByAttemptIdOrdered(attemptId);
        if (!judged.isEmpty()) {
            // Open EntityManager in View can keep these entities across the two transactions.
            rows.forEach(entityManager::refresh);
        }
        if (!expired && applyDrafts != null) {
            applyDrafts.accept(rows);
            answers.flush();
        }
        List<CodeAnswerJudge.Plan> plans = hasUngradedCode(rows)
                ? judge.prepareDrafts(rows, maxScore(attempt, rows)) : List.of();
        if (!plans.isEmpty() && !plans.equals(judged)) {
            UUID token = ownerToken != null ? ownerToken : UUID.randomUUID();
            attempt.setCodeJudgingToken(token);
            attempt.setCodeJudgingUntil(Instant.now().plusSeconds(CODE_JUDGING_LEASE_SECONDS));
            attempts.flush();
            return new CloseStep(false, false, token, plans);
        }
        for (CodeAnswerJudge.Plan plan : plans) {
            AttemptAnswer row = rows.stream().filter(answer -> plan.questionId().equals(answer.getQuestion().getQuestionId()))
                    .findFirst().orElseThrow();
            judge.persist(row, plan, verdicts.get(plan.questionId()), Instant.now());
        }
        gradeAndClose(attempt, rows, submittedAt);
        return new CloseStep(true, false, null, List.of());
    }

    private BigDecimal maxScore(ExamAttempt attempt, List<AttemptAnswer> rows) {
        Snapshots.ExamSnapshot exam = paperFactory.read(attempt.getExamSnapshot(), Snapshots.ExamSnapshot.class);
        if (exam != null && exam.maxScore() != null) {
            return exam.maxScore();
        }
        return attempt.getExam() != null && attempt.getExam().getMaxScore() != null
                ? attempt.getExam().getMaxScore() : BigDecimal.valueOf(rows.size());
    }

    /**
     * Grades every answer of the attempt and closes it (spec 6.4 rule 3):
     *
     * <ul>
     *   <li>no answer → {@code score 0}, {@code isCorrect = false}, {@code grading_status = AUTO}
     *       (an unanswered essay does not wait for the AI worker);</li>
     *   <li>quiz question → all-or-nothing against {@code key_snapshot}, {@code score = P_q} or 0;</li>
     *   <li>rubric question (ESSAY/DIAGRAM) with an answer → {@code PENDING_AI},
     *       {@code score = null}; no AI call here (spec 0.3 rule 7).</li>
     * </ul>
     *
     * <p>Scores only ever come from {@code exam_snapshot.maxScore} and {@code weight_snapshot}
     * (spec 0.3 rule 6). The attempt ends {@code SUBMITTED} while a rubric answer waits for the
     * AI worker, {@code COMPLETED} otherwise.</p>
     */
    void gradeAndClose(ExamAttempt attempt, List<AttemptAnswer> rows, Instant now) {
        BigDecimal maxScore = maxScore(attempt, rows);

        List<BigDecimal> weights = rows.stream().map(AttemptAnswer::getWeightSnapshot).toList();
        BigDecimal totalWeight = AttemptScoring.totalWeight(weights);

        boolean waitingForAi = false;
        // Every addend keeps AGGREGATE_SCALE digits; only the total is rounded, so a paper whose
        // every question is fully correct totals exactly maxScore instead of drifting a cent.
        List<BigDecimal> scores = new ArrayList<>();
        for (AttemptAnswer row : rows) {
            // CD-05 finalized a code answer while the attempt was still running: its verdict and
            // score stand (spec 19.3), so this row is never re-graded here. A score that took the
            // whole question is re-derived from the snapshot instead of the 2-digit stored value.
            if (row.getGradedAt() != null && row.getScoreEarned() != null) {
                scores.add(AttemptScoring.contribution(
                        row.getWeightSnapshot(), totalWeight, maxScore, row.getScoreEarned()));
                continue;
            }
            JsonNode response = paperFactory.readResponse(row.getResponse());
            Snapshots.DisplayQuestion display =
                    paperFactory.read(row.getDisplaySnapshot(), Snapshots.DisplayQuestion.class);
            // A legacy row without a display snapshot still has its question type on the live row.
            String type = paperFactory.questionType(row, display);

            // The addend for the running total: the unrounded score of this pass, or null while a
            // rubric answer waits for the AI worker. The row itself stores the 2-digit value.
            BigDecimal rawScore;
            if (AnswerResponseValidator.isEmpty(response) || "CODE".equals(type)) {
                rawScore = BigDecimal.ZERO;
                row.setScoreEarned(rawScore);
                row.setIsCorrect(false);
                row.setGradingStatus(GRADING_AUTO);
            } else if (AttemptGrader.isRubricType(type)) {
                rawScore = null;
                row.setScoreEarned(null);
                row.setIsCorrect(null);
                row.setGradingStatus(GRADING_PENDING_AI);
                waitingForAi = true;
            } else {
                Snapshots.KeySnapshot key =
                        paperFactory.read(row.getKeySnapshot(), Snapshots.KeySnapshot.class);
                // The grader works with the unrounded P_q; the 2-digit column value is written below.
                BigDecimal maxPoints = AttemptScoring.questionPointsExact(
                        row.getWeightSnapshot(), totalWeight, maxScore);
                AttemptGrader.Grade grade = AttemptGrader.grade(type, response, key, maxPoints);
                rawScore = grade.score();
                row.setScoreEarned(AttemptScoring.output(rawScore));
                row.setIsCorrect(grade.correct());
                row.setGradingStatus(GRADING_AUTO);
            }
            if (row.getIsCorrect() != null) {
                reviews.record(attempt.getUser().getUserId(), row.getQuestion(), row.getIsCorrect(), row.getResponse());
            }
            if (rawScore != null) {
                scores.add(rawScore);
            }
        }

        attempt.setTotalScore(AttemptScoring.output(AttemptScoring.sumScores(scores)));
        Instant storedTime = now.truncatedTo(ChronoUnit.MICROS);
        attempt.setSubmittedAt(storedTime);
        attempt.setSubmitTime(storedTime);
        attempt.setAutoSubmitted(attempt.getDeadlineAt() != null && now.isAfter(attempt.getDeadlineAt()));
        attempt.setStatus(waitingForAi ? STATUS_SUBMITTED : STATUS_COMPLETED);
        attempt.setCodeJudgingToken(null);
        attempt.setCodeJudgingUntil(null);
    }
}
