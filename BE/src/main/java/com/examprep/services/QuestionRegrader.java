package com.examprep.services;

import com.examprep.dto.attempt.Snapshots;
import com.examprep.entities.AnswerRegradeLog;
import com.examprep.entities.AttemptAnswer;
import com.examprep.entities.ExamAttempt;
import com.examprep.entities.Question;
import com.examprep.entities.QuestionRegradeJob;
import com.examprep.repositories.AnswerOptionRepository;
import com.examprep.repositories.AnswerRegradeLogRepository;
import com.examprep.repositories.AttemptAnswerRepository;
import com.examprep.repositories.QuestionRegradeJobRepository;
import com.examprep.util.attempt.AnswerResponseValidator;
import com.examprep.util.attempt.AttemptGrader;
import com.examprep.util.attempt.AttemptScoring;
import com.fasterxml.jackson.databind.JsonNode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

/**
 * Re-scores the finished answers of one question after a reported-issue fix. Same scoring as submit
 * ({@link AttemptAutoSubmitter#gradeAndClose}): P_q from the attempt's frozen weights and max score.
 *
 * <ul>
 *   <li>ANSWER_CORRECTED: the live key is frozen again into {@code key_snapshot} and the quiz answer re-graded;
 *       rubric answers are skipped (team rule: an AI grade is final).</li>
 *   <li>QUESTION_VOIDED: every answer gets the full points of the question.</li>
 * </ul>
 *
 * <p>An answer is done once its {@code question_version} reaches the job's target, so a retry only picks
 * what failed or what was submitted since. Caller holds the job row lock and the transaction.</p>
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class QuestionRegrader {
    public static final String VOIDED = "QUESTION_VOIDED";
    public static final String ANSWER_CORRECTED = "ANSWER_CORRECTED";
    public static final Set<String> FINISHED = Set.of("SUBMITTED", "COMPLETED");
    private static final Set<String> WAITING_FOR_AI = Set.of("PENDING_AI", "QUEUED", "GRADING", "FAILED");

    private final QuestionRegradeJobRepository jobs;
    private final AttemptAnswerRepository answers;
    private final AnswerOptionRepository options;
    private final AnswerRegradeLogRepository logs;
    private final AttemptPaperFactory paperFactory;

    /**
     * True when this resolution re-scores answers of a question of this type. Any resolution whose edit bumped
     * the scoring version of an auto-graded question regrades too, whatever type the manager picked.
     */
    public static boolean regrades(String resolutionType, String questionType, boolean scoringChanged) {
        return VOIDED.equals(resolutionType)
                || ((ANSWER_CORRECTED.equals(resolutionType) || scoringChanged) && AttemptGrader.isAutoGraded(questionType));
    }

    public long countPending(Long questionId, int version) {
        return jobs.countStaleAnswers(questionId, FINISHED, version);
    }

    public void run(QuestionRegradeJob job) {
        Question question = job.getQuestion();
        boolean voided = VOIDED.equals(job.getResolutionType());
        int to = job.getQuestionVersionTo();
        // Prefer the key frozen at creation. Legacy jobs have no snapshot and fall back to the live key.
        String keyJson = voided ? null
                : job.getKeySnapshot() != null ? job.getKeySnapshot() : keyJson(question);
        Snapshots.KeySnapshot key = keyJson == null ? null : paperFactory.read(keyJson, Snapshots.KeySnapshot.class);
        if (!voided && key == null) {
            throw new IllegalStateException("Regrade job " + job.getJobId() + " has an unreadable key snapshot");
        }

        List<AttemptAnswer> stale = jobs.staleAnswers(question.getQuestionId(), FINISHED, to);
        Map<ExamAttempt, List<AttemptAnswer>> byAttempt = new LinkedHashMap<>();
        stale.forEach(a -> byAttempt.computeIfAbsent(a.getAttempt(), k -> new ArrayList<>()).add(a));

        job.setStatus(QuestionRegradeJob.RUNNING);
        job.setTotalAnswers(job.getProcessedAnswers() + stale.size());
        int done = 0;
        int failed = 0;
        Instant now = Instant.now();
        for (Map.Entry<ExamAttempt, List<AttemptAnswer>> entry : byAttempt.entrySet()) {
            ExamAttempt attempt = entry.getKey();
            List<AttemptAnswer> rows = answers.findByAttempt_AttemptId(attempt.getAttemptId());
            BigDecimal maxScore = maxScore(attempt, rows.size());
            BigDecimal totalWeight = AttemptScoring.totalWeight(rows.stream().map(AttemptAnswer::getWeightSnapshot).toList());
            for (AttemptAnswer row : entry.getValue()) {
                Outcome outcome;
                try {
                    outcome = outcome(row, question, key, keyJson, totalWeight, maxScore);
                } catch (RuntimeException e) {
                    log.warn("Regrade job {} failed on attempt answer {}", job.getJobId(), row.getAttemptAnswerId(), e);
                    failed++;
                    continue;
                }
                // Write the audit row first and flush it, so an answer can never be bumped without a log.
                // A database failure here is deliberately not swallowed: it rolls back the whole job instead
                // of leaving half-applied answers that a retry would skip.
                logs.saveAndFlush(AnswerRegradeLog.builder()
                        .regradeJob(job).attemptAnswer(row).oldScore(row.getScoreEarned()).newScore(outcome.newScore())
                        .questionVersionFrom(row.getQuestionVersion()).questionVersionTo(to).build());
                row.setScoreEarned(outcome.newScore());
                row.setIsCorrect(outcome.correct());
                row.setGradingStatus(outcome.gradingStatus());
                row.setGradingError(outcome.gradingError());
                row.setKeySnapshot(outcome.keySnapshot());
                row.setCheckResult(outcome.checkResult());
                row.setQuestionVersion(to);
                row.setGradedAt(now);
                done++;
            }
            attempt.setTotalScore(AttemptScoring.output(AttemptScoring.sumScores(
                    rows.stream().map(AttemptAnswer::getScoreEarned).filter(Objects::nonNull).toList())));
            if ("SUBMITTED".equals(attempt.getStatus()) && rows.stream().noneMatch(r -> WAITING_FOR_AI.contains(r.getGradingStatus()))) {
                attempt.setStatus("COMPLETED");
            }
        }
        // Attempts still running keep their version (they are graded at submit). They must use the
        // newest key, not this job's frozen one: a later correction supersedes it for future submits.
        if (!voided) {
            List<AttemptAnswer> inProgress = jobs.inProgressAnswers(question.getQuestionId());
            if (!inProgress.isEmpty()) {
                String liveKeyJson = keyJson(question);
                inProgress.forEach(r -> r.setKeySnapshot(liveKeyJson));
            }
        }

        job.setProcessedAnswers(job.getProcessedAnswers() + done);
        job.setFailedAnswers(failed);
        job.setStatus(failed == 0 ? QuestionRegradeJob.COMPLETED : done > 0 ? QuestionRegradeJob.PARTIAL_FAILED : QuestionRegradeJob.FAILED);
        job.setFinishedAt(now);
    }

    /** Freezes the current answer key for a job created now. */
    public String keyJson(Question question) {
        return paperFactory.write(paperFactory.key(question, options.findByQuestion_QuestionId(question.getQuestionId())));
    }

    /** {@code key} null = the question is voided. Pure: it must not touch the managed answer. */
    private Outcome outcome(AttemptAnswer row, Question question, Snapshots.KeySnapshot key, String keyJson,
                            BigDecimal totalWeight, BigDecimal maxScore) {
        BigDecimal maxPoints = AttemptScoring.output(AttemptScoring.questionMaxPoints(row.getWeightSnapshot(), totalWeight, maxScore));
        if (key == null) {
            return new Outcome(maxPoints, true, "AUTO", null, row.getKeySnapshot(), row.getCheckResult());
        }
        Snapshots.DisplayQuestion display = paperFactory.read(row.getDisplaySnapshot(), Snapshots.DisplayQuestion.class);
        String type = display != null ? display.questionType() : question.getQuestionType();
        JsonNode response = paperFactory.readResponse(row.getResponse());
        if (AnswerResponseValidator.isEmpty(response)) {
            return new Outcome(BigDecimal.ZERO, false, row.getGradingStatus(), row.getGradingError(), keyJson, null);
        }
        AttemptGrader.Grade grade = AttemptGrader.grade(type, response, key, maxPoints);
        return new Outcome(AttemptScoring.output(grade.score()), grade.correct(), row.getGradingStatus(), row.getGradingError(), keyJson, null);
    }

    private record Outcome(BigDecimal newScore, boolean correct, String gradingStatus, String gradingError,
                           String keySnapshot, String checkResult) { }

    private BigDecimal maxScore(ExamAttempt attempt, int rows) {
        Snapshots.ExamSnapshot exam = paperFactory.read(attempt.getExamSnapshot(), Snapshots.ExamSnapshot.class);
        if (exam != null && exam.maxScore() != null) {
            return exam.maxScore();
        }
        return attempt.getExam() != null && attempt.getExam().getMaxScore() != null
                ? attempt.getExam().getMaxScore() : BigDecimal.valueOf(rows);
    }
}
