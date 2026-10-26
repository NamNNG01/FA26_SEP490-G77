package com.examprep.dto.attempt;

import com.fasterxml.jackson.databind.JsonNode;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Map;

/**
 * Response bodies of the student attempt APIs (spec 6.1 SA-01 … 6.5 SA-05, 5.2 SA-06).
 *
 * <p>Nothing here ever carries {@code key_snapshot}, {@code answer_key}, the original rubric or a
 * sample drawio file: those stay server-side until the attempt is graded (spec 0.3 rules 4-5).</p>
 */
public final class AttemptResponses {
    private AttemptResponses() {}

    /** SA-01 / SA-02: the paper exactly as this attempt froze it. {@code answers} is SA-02 only. */
    public record Session(
            Long attemptId,
            Long examId,
            String title,
            String status,
            Instant startTime,
            Instant deadlineAt,
            Instant serverTime,
            BigDecimal maxScore,
            List<Question> questions,
            List<Answer> answers) {}

    public record Question(
            Long questionId,
            Integer orderIndex,
            String questionType,
            String content,
            List<Option> options,
            Matching matching,
            BigDecimal maxPoints,
            AnswerSpace answerSpace) {}

    public record Option(Long optionId, String optionText, Boolean isCorrectAnswer) {}

    /** MATCHING renders as two shuffled columns; the pairing only exists in {@code key_snapshot}. */
    public record Matching(List<String> lefts, List<String> rights) {}

    public record AnswerSpace(Integer maxLength) {}

    public record Answer(Long questionId, Integer draftSeq, JsonNode response) {}

    /** SA-03 */
    public record DraftSaved(List<Saved> saved, List<Rejected> rejected, Instant deadlineAt) {}

    public record Saved(Long questionId, Integer draftSeq) {}

    public record Rejected(Long questionId, String reason, String detail) {}

    public static final String REASON_NOT_IN_ATTEMPT = "NOT_IN_ATTEMPT";
    public static final String REASON_INVALID_RESPONSE = "INVALID_RESPONSE";

    /** SA-04 */
    public record Submitted(
            Long attemptId,
            String status,
            BigDecimal totalScore,
            BigDecimal pendingPoints,
            BigDecimal maxScore,
            Boolean autoSubmitted,
            Instant submittedAt) {}

    /** SA-05 */
    public record Result(
            Long attemptId,
            String examTitle,
            String status,
            BigDecimal totalScore,
            BigDecimal pendingPoints,
            BigDecimal maxScore,
            Instant submittedAt,
            Boolean autoSubmitted,
            List<ResultQuestion> questions) {}

    public record ResultQuestion(
            Long questionId,
            Integer orderIndex,
            String questionType,
            String content,
            List<Option> options,
            JsonNode yourResponse,
            Boolean isCorrect,
            BigDecimal maxPoints,
            BigDecimal scoreEarned,
            BigDecimal weight,
            String gradingStatus,
            String gradingError,
            List<Criterion> criteria,
            String overallFeedback,
            Explanation explanation,
            CorrectAnswer correctAnswer) {}

    /**
     * The key of the question types whose options carry no {@code isCorrectAnswer} flag; only
     * sent on SA-05, i.e. once the attempt is submitted. Exactly one field is set:
     * ORDERING → {@code orderedOptionIds}, MATCHING → {@code pairs},
     * FILL_BLANK → {@code blanks} (placeholder number → accepted spellings).
     */
    public record CorrectAnswer(
            List<Long> orderedOptionIds,
            List<MatchPair> pairs,
            Map<String, List<String>> blanks) {}

    public record MatchPair(String left, String right) {}

    public record Criterion(
            String criterionId,
            String name,
            BigDecimal maxPoints,
            BigDecimal points,
            String feedback) {}

    public record Explanation(String text, String source) {}

    /** SA-06 */
    public record HistoryItem(
            Long attemptId,
            String status,
            BigDecimal totalScore,
            BigDecimal pendingPoints,
            BigDecimal maxScore,
            Instant startTime,
            Instant submittedAt,
            Boolean autoSubmitted) {}

    /** SA-07: the attempt was discarded, nothing of it stays in the database. */
    public record Cancelled(Long attemptId, Long examId) {}

    /** {@code data} of 409 ATTEMPT_IN_PROGRESS (SA-01). */
    public record AttemptInProgress(Long activeAttemptId, Instant deadlineAt) {}

    /** {@code data} of 409 EXAM_INVALID_QUESTIONS (SA-01). */
    public record InvalidQuestions(List<Long> invalidQuestionIds) {}

    /** {@code data} of 409 ATTEMPT_NOT_SUBMITTED (SA-05). */
    public record NotSubmitted(String status) {}
}
