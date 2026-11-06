package com.examprep.dto.practice;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.databind.JsonNode;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

/**
 * Response bodies of the Module Practice APIs (MP-01 … MP-12).
 *
 * <p>The raw {@code key_snapshot} document never leaves the service layer, and a rubric or a sample
 * diagram never does at all. MP-04 does expose the frozen grading key of an auto-graded question
 * ({@link QuestionView#correctAnswer()}) so the client can judge an answer in place with exactly the
 * rule the server grades by. Question content, options and media are always read from the session's
 * {@code display_snapshot}, so a question edited mid-session cannot change a running practice.</p>
 */
public final class ModulePracticeResponses {

    private ModulePracticeResponses() {
    }

    // ------------------------------------------------------------------ MP-01 overview

    /**
     * MP-01: one module's practice situation for the authenticated student. For a course's General
     * pool {@code moduleId} is {@code null} and {@code moduleTitle} is "General"; the course stays filled.
     */
    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record Overview(
            Long moduleId,
            String moduleTitle,
            Long courseId,
            String courseTitle,
            long totalQuestions,
            long practicedQuestions,
            long unpracticedQuestions,
            long everCorrectQuestions,
            long totalAttempts,
            long gradedAttempts,
            long correctAttempts,
            long wrongAttempts,
            /** Correct graded attempts / graded attempts, 0 when nothing is graded yet. */
            BigDecimal accuracyRate,
            long questionsNeedingReview,
            ActiveSessionInfo activeSession) {
    }

    /** The open session of this module, when there is one. */
    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record ActiveSessionInfo(
            Long sessionId,
            String mode,
            int questionCount,
            int answeredCount,
            int correctCount,
            String status,
            Instant startedAt,
            Instant lastActivityAt,
            Long nextSessionQuestionId,
            Integer nextQuestionOrderIndex) {
    }

    // ------------------------------------------------------------------ MP-02 / MP-03 / MP-07 sessions

    /** MP-02/MP-03/MP-07: the session as the FE shows it; never an answer key. */
    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record SessionDetail(
            Long sessionId,
            Long moduleId,
            String moduleTitle,
            Long courseId,
            String courseTitle,
            String mode,
            int questionCount,
            int answeredCount,
            int correctCount,
            String status,
            Instant startedAt,
            Instant lastActivityAt,
            Instant completedAt,
            int durationSeconds,
            /** True when MP-02 returned an already open session instead of creating one. */
            boolean resumed,
            Long nextSessionQuestionId,
            Integer nextQuestionOrderIndex,
            List<SessionQuestionSummary> questions) {
    }

    /** One row of the session navigator: position and progress only, no content. */
    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record SessionQuestionSummary(
            Long sessionQuestionId,
            Long questionId,
            int orderIndex,
            String questionType,
            boolean answered,
            int attemptCount,
            Boolean latestIsCorrect,
            BigDecimal latestScore,
            String gradingStatus) {
    }

    // ------------------------------------------------------------------ MP-04 one question

    /**
     * MP-04: what the student is shown, the frozen key of an auto-graded question (so the answer can
     * be judged in place) and their own attempts. Never the raw {@code key_snapshot} document.
     */
    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record QuestionView(
            Long sessionId,
            Long sessionQuestionId,
            Long questionId,
            int orderIndex,
            int questionsTotal,
            int questionsAnswered,
            String questionType,
            String content,
            List<OptionView> options,
            MatchingView matching,
            AnswerSpaceView answerSpace,
            List<MediaView> media,
            GroupView group,
            CorrectAnswerView correctAnswer,
            boolean isBookmarked,
            int attemptCount,
            Boolean latestIsCorrect,
            BigDecimal latestScore,
            String gradingStatus,
            List<SubmittedAnswer> attempts) {
    }

    /** An option as the student saw it when the session started: id and text only. */
    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record OptionView(Long optionId, String optionText) {
    }

    /** MATCHING renders as two independently shuffled columns. */
    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record MatchingView(List<String> lefts, List<String> rights) {
    }

    /** ESSAY / CODE only. */
    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record AnswerSpaceView(Integer maxLength) {
    }

    /** A displayable media asset of the question or of one of its options. */
    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record MediaView(Long mediaId, Long optionId, String mediaType, String url, String altText) {
    }

    /** The shared passage a grouped question belongs to. */
    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record GroupView(Long groupId, String questionType, String title, String passageText) {
    }

    /**
     * MP-04: the frozen grading key of an auto-graded question, read from the session question's
     * {@code key_snapshot}. Only the field matching the question type is set; the others stay
     * {@code null}. Rubric types (ESSAY, DIAGRAM, CODE) carry a {@code null} answer entirely — they
     * are scored by the AI worker, not against a key.
     */
    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record CorrectAnswerView(
            List<Long> correctOptionIds,
            List<BlankView> blanks,
            List<MatchPairView> pairs,
            List<Long> correctOrder) {
    }

    /** FILL_BLANK: one placeholder with the spellings it accepts and its case rule. */
    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record BlankView(Integer index, List<String> accepted, Boolean caseSensitive) {
    }

    /** MATCHING: the original left/right pairing, independent of the shuffled display. */
    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record MatchPairView(String left, String right) {
    }

    // ------------------------------------------------------------------ MP-05 / MP-06 answers

    /** MP-06: one stored attempt. {@code response} is the student's own payload. */
    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record SubmittedAnswer(
            Long practiceAnswerId,
            int attemptNumber,
            JsonNode response,
            Boolean isCorrect,
            BigDecimal scoreEarned,
            String gradingStatus,
            JsonNode feedback,
            JsonNode criteriaScores,
            int timeSpentSeconds,
            Instant answeredAt,
            Instant gradedAt) {
    }

    /** MP-06: the full attempt history of one session question, oldest attempt first. */
    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record AnswerHistory(
            Long sessionId,
            Long sessionQuestionId,
            Long questionId,
            int attemptCount,
            List<SubmittedAnswer> attempts) {
    }

    /** MP-05: the grading outcome of the attempt just stored, plus the refreshed session counters. */
    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record AnswerSubmitted(
            Long sessionId,
            Long sessionQuestionId,
            Long questionId,
            /** The stored attempt, so MP-09 can be asked about exactly this answer. */
            Long practiceAnswerId,
            int attemptNumber,
            Boolean isCorrect,
            BigDecimal scoreEarned,
            String gradingStatus,
            JsonNode feedback,
            JsonNode criteriaScores,
            Instant answeredAt,
            Instant gradedAt,
            /** True when the submitted {@code requestKey} had already been answered. */
            boolean duplicate,
            SessionProgress session) {
    }

    /** MP-05: the session counters after the submit, so the FE needs no extra call. */
    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record SessionProgress(
            int questionCount,
            int answeredCount,
            int correctCount,
            String status,
            Long nextSessionQuestionId,
            Integer nextQuestionOrderIndex) {
    }

    // ------------------------------------------------------------------ MP-08 result

    /**
     * MP-08: unique-question statistics and attempt statistics, kept apart on purpose.
     * {@code questionsLatestCorrect}, {@code questionsLatestWrong}, {@code questionsAwaitingGrade},
     * {@code questionsGradedWithoutVerdict} and {@code questionsFailedGrade} sum to
     * {@code answeredQuestions}.
     */
    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record Result(
            Long sessionId,
            Long moduleId,
            String moduleTitle,
            String status,
            int totalQuestions,
            int answeredQuestions,
            int unansweredQuestions,
            int questionsLatestCorrect,
            int questionsLatestWrong,
            /** Answered, but the latest attempt has not been graded yet (QUEUED / PENDING_AI / GRADING). */
            int questionsAwaitingGrade,
            /**
             * Answered and graded, yet without a boolean verdict: a rubric question (ESSAY, DIAGRAM,
             * CODE) carries a score from the AI grader but no right/wrong answer, exactly as in an exam.
             */
            int questionsGradedWithoutVerdict,
            /** Answered, and the latest attempt's grading failed (AI error, timeout, quota, oversize). */
            int questionsFailedGrade,
            long totalAttempts,
            long gradedAttempts,
            long correctAttempts,
            long wrongAttempts,
            BigDecimal accuracyRate,
            int durationSeconds,
            Instant startedAt,
            Instant completedAt,
            List<ResultQuestion> questions) {
    }

    /** MP-08: the latest outcome of one session question, beside its attempt count. */
    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record ResultQuestion(
            Long sessionQuestionId,
            Long questionId,
            int orderIndex,
            String questionType,
            int attemptCount,
            Boolean latestIsCorrect,
            BigDecimal latestScore,
            String gradingStatus,
            Instant firstAnsweredAt,
            Instant lastAnsweredAt,
            /**
             * MP-08 with {@code ?includeQuestions=true}: the whole MP-04 body of this row, so the
             * result page needs one request. {@code null} on a plain MP-08 call.
             */
            QuestionView question) {
    }

    // ------------------------------------------------------------------ MP-11 review questions

    /** MP-11: a question the student should practise again, with its long-term progress. */
    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record ReviewItem(
            Long progressId,
            Long questionId,
            Long moduleId,
            /** "General" for the course's module-less pool. */
            String moduleTitle,
            String questionType,
            String content,
            int totalAttempts,
            int gradedAttempts,
            int correctAttempts,
            int wrongAttempts,
            Boolean lastIsCorrect,
            BigDecimal bestScore,
            String masteryStatus,
            Instant lastAnsweredAt) {
    }

    // ------------------------------------------------------------------ MP-12 reset

    /** MP-12: what the reset actually removed. Nothing outside Module Practice is counted. */
    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record ResetResult(Long moduleId, String moduleTitle, int deletedSessions,
                              int deletedProgressRecords) {
    }

    // ------------------------------------------------------------------ MP-09 explanation

    /** MP-09: one explanation, its provenance, and what is left of the student's AI quota. */
    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record Explanation(
            Long questionId,
            Long sessionId,
            Long sessionQuestionId,
            Long practiceAnswerId,
            String explanation,
            /** GENERATED, CACHED, MANAGER, NOT_APPLICABLE, FAILED or QUOTA_EXCEEDED. */
            String source,
            String reason,
            QuotaLeft quota) {
    }

    /** The same shape SE-01 returns, so both AI screens read alike. */
    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record QuotaLeft(
            long freeLimit,
            long freeUsed,
            long freeReserved,
            long freeRemaining,
            Instant freeResetAt,
            String planName,
            long planRemaining,
            long totalRemaining) {
    }
}
