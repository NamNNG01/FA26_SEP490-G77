package com.examprep.services;

import com.examprep.dto.attempt.Snapshots;
import com.examprep.entities.AttemptAnswer;
import com.examprep.entities.ExamAttempt;
import com.examprep.util.attempt.AnswerResponseValidator;
import com.examprep.util.attempt.AttemptGrader;
import com.examprep.util.attempt.AttemptScoring;
import com.fasterxml.jackson.databind.JsonNode;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

/**
 * Grades and closes an attempt (spec 6.4 rules 3-5, 6.3 "410 ATTEMPT_EXPIRED").
 *
 * <p>{@link #gradeAndClose} always runs inside the caller's transaction, and every caller closes
 * the attempt <em>before</em> it can fail: SA-01 closes a stale attempt and then starts a new one,
 * SA-02 closes it before building the response, and SA-03 returns {@code 410} only after its own
 * write transaction has already committed the closing.</p>
 */
@Component
@RequiredArgsConstructor
public class AttemptAutoSubmitter {

    /** Past {@code deadlineAt} the student may still save (spec 6.3: 410 past deadline + 5s). */
    public static final long EXPIRY_GRACE_SECONDS = 5;

    private static final String STATUS_SUBMITTED = "SUBMITTED";
    private static final String STATUS_COMPLETED = "COMPLETED";
    private static final String GRADING_AUTO = "AUTO";
    private static final String GRADING_PENDING_AI = "PENDING_AI";

    private final AttemptPaperFactory paperFactory;

    /** True past {@code deadlineAt + 5s}: from then on the server refuses further saves. */
    public boolean isExpired(ExamAttempt attempt, Instant now) {
        return attempt != null
                && attempt.getDeadlineAt() != null
                && now.isAfter(attempt.getDeadlineAt().plusSeconds(EXPIRY_GRACE_SECONDS));
    }

    /**
     * Grades every answer of the attempt and closes it (spec 6.4 rule 3):
     *
     * <ul>
     *   <li>no answer → {@code score 0}, {@code isCorrect = false}, {@code grading_status = AUTO}
     *       (an unanswered essay does not wait for the AI worker);</li>
     *   <li>quiz question → all-or-nothing against {@code key_snapshot}, {@code score = P_q} or 0;</li>
     *   <li>rubric question (ESSAY/DIAGRAM/CODE) with an answer → {@code PENDING_AI},
     *       {@code score = null}; no AI call here (spec 0.3 rule 7).</li>
     * </ul>
     *
     * <p>Scores only ever come from {@code exam_snapshot.maxScore} and {@code weight_snapshot}
     * (spec 0.3 rule 6). The attempt ends {@code SUBMITTED} while a rubric answer waits for the
     * AI worker, {@code COMPLETED} otherwise.</p>
     */
    public void gradeAndClose(ExamAttempt attempt, List<AttemptAnswer> rows, Instant now) {
        Snapshots.ExamSnapshot exam = paperFactory.read(attempt.getExamSnapshot(), Snapshots.ExamSnapshot.class);
        BigDecimal maxScore = exam != null && exam.maxScore() != null
                ? exam.maxScore()
                // Only a legacy attempt without a frozen paper falls back to its live exam.
                : attempt.getExam().getMaxScore() != null ? attempt.getExam().getMaxScore() : BigDecimal.ZERO;

        List<BigDecimal> weights = rows.stream().map(AttemptAnswer::getWeightSnapshot).toList();
        BigDecimal totalWeight = AttemptScoring.totalWeight(weights);

        boolean waitingForAi = false;
        List<BigDecimal> scores = new ArrayList<>();
        for (AttemptAnswer row : rows) {
            JsonNode response = paperFactory.readResponse(row.getResponse());
            Snapshots.DisplayQuestion display =
                    paperFactory.read(row.getDisplaySnapshot(), Snapshots.DisplayQuestion.class);
            // A legacy row without a display snapshot still has its question type on the live row.
            String type = display != null ? display.questionType() : row.getQuestion().getQuestionType();

            if (AnswerResponseValidator.isEmpty(response)) {
                row.setScoreEarned(BigDecimal.ZERO);
                row.setIsCorrect(false);
                row.setGradingStatus(GRADING_AUTO);
            } else if (AttemptGrader.isRubricType(type)) {
                row.setScoreEarned(null);
                row.setIsCorrect(null);
                row.setGradingStatus(GRADING_PENDING_AI);
                waitingForAi = true;
            } else {
                Snapshots.KeySnapshot key =
                        paperFactory.read(row.getKeySnapshot(), Snapshots.KeySnapshot.class);
                BigDecimal maxPoints = AttemptScoring.output(
                        AttemptScoring.questionMaxPoints(row.getWeightSnapshot(), totalWeight, maxScore));
                AttemptGrader.Grade grade = AttemptGrader.grade(type, response, key, maxPoints);
                row.setScoreEarned(AttemptScoring.output(grade.score()));
                row.setIsCorrect(grade.correct());
                row.setGradingStatus(GRADING_AUTO);
            }
            if (row.getScoreEarned() != null) {
                scores.add(row.getScoreEarned());
            }
        }

        attempt.setTotalScore(AttemptScoring.output(AttemptScoring.sumScores(scores)));
        attempt.setSubmittedAt(now);
        attempt.setSubmitTime(now);
        attempt.setAutoSubmitted(attempt.getDeadlineAt() != null && now.isAfter(attempt.getDeadlineAt()));
        attempt.setStatus(waitingForAi ? STATUS_SUBMITTED : STATUS_COMPLETED);
    }
}
