package com.examprep.dto;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Map;

/** Question issue reports (student) and the manager ticket queue with its regrade jobs. */
public final class QuestionIssueDtos {
    private QuestionIssueDtos() { }

    // ------------------------------------------------------------------ requests

    /**
     * {@code attemptId} (exam, running or finished) or {@code practiceSessionId}: where the student met the
     * question; the server checks it is theirs, then records the question number and their answer. Without
     * either, {@code source} may say NOTEBOOK or OTHER. {@code suggestedOptionIds} / {@code suggestedAnswer}:
     * what the student thinks is right. All of these are optional.
     */
    public record ReportRequest(
            @NotNull Long questionId,
            @NotBlank String issueType,
            @NotBlank @Size(min = 10, max = 3000) String description,
            @Size(max = 1000) String attachmentUrl,
            String source,
            Long attemptId,
            Long practiceSessionId,
            @Size(max = 20) List<Long> suggestedOptionIds,
            @Size(max = 1000) String suggestedAnswer) { }

    public record AssignRequest(Long assignedTo) { }

    public record StatusRequest(@NotBlank String status, @Size(max = 3000) String note) { }

    public record DuplicateRequest(@NotNull Long duplicateOfIssueId, @NotBlank @Size(max = 3000) String note) { }

    /** {@code changes}: the question fields to correct, same names as the question update API. */
    public record ResolveRequest(
            @NotBlank String resolutionType,
            @NotBlank @Size(max = 3000) String resolutionNote,
            Long expectedLockVersion,
            Map<String, Object> changes) { }

    public record ConfirmRegradeRequest(@NotNull Long jobId, @NotNull Boolean confirmed, @NotBlank @Size(max = 1000) String reason) { }

    // ------------------------------------------------------------------ responses

    public record UserRef(Long userId, String fullName) { }

    /** {@code priority}: HIGH / MEDIUM / LOW from {@code priorityScore}. */
    public record ListItem(Long issueId, Long questionId, String questionContent, String questionType, String issueType,
                           String status, Long courseId, String courseName, Long moduleId, String moduleTitle,
                           long reportCount, String priority, int priorityScore, UserRef assignedTo,
                           Instant createdAt, Instant lastReportedAt, Instant updatedAt) { }

    /** The student's answer when they reported; score fields stay null while the exam is still running. */
    public record ContextSnapshot(String contextTitle, String attemptStatus, JsonNode response,
                                  List<OptionRef> selectedOptions, Boolean isCorrect, BigDecimal scoreEarned,
                                  String gradingStatus, Instant answeredAt) { }

    public record OptionRef(Long optionId, String optionText) { }

    /** {@code outdated}: the question changed after this report (another lock version). */
    public record ReportView(Long reportId, Long userId, String studentName, String issueType, String description,
                             String attachmentUrl, String source, Long attemptId, Long practiceSessionId,
                             Integer questionNumber, Long questionLockVersion, boolean outdated, ContextSnapshot context,
                             List<OptionRef> suggestedOptions, String suggestedAnswer, Instant createdAt) { }

    public record Location(Long courseId, String courseName, Long moduleId, String moduleTitle, Long groupId,
                           String groupTitle) { }

    public record Count(String key, long count) { }

    public record SuggestedOption(Long optionId, String optionText, Boolean isCorrectNow, long count) { }

    public record ReportSummary(List<Count> byType, List<Count> bySource, List<SuggestedOption> suggestedOptions,
                                List<String> suggestedAnswers, long outdatedReports) { }

    /** Finished exam answers and every practice try; {@code correctRate} in percent, null when nothing answered. */
    public record AnswerStats(long examAnswers, long examCorrect, Double examCorrectRate, BigDecimal examAverageScore,
                              long practiceAnswers, long practiceCorrect, Double practiceCorrectRate,
                              List<OptionPick> optionPicks) { }

    /** How often each option was picked (choice questions); {@code pickRate} over every answer counted. */
    public record OptionPick(Long optionId, String optionText, Boolean isCorrect, long examPicks, long practicePicks,
                             Double pickRate) { }

    public record ExamRef(Long examId, String title, String status, String mode, boolean inPaper, long attempts) { }

    /**
     * What a resolution would touch: finished answers re-scored by ANSWER_CORRECTED (auto-graded types only) or
     * QUESTION_VOIDED, and running attempts that would grade with the fixed key.
     */
    public record RegradeImpact(long finishedAnswers, long inProgressAnswers, boolean answerCorrectionRegrades) { }

    public record RelatedIssue(Long issueId, String issueType, String status, String resolutionType, long reportCount,
                               Instant createdAt, Instant resolvedAt) { }

    public record Insights(ReportSummary reports, AnswerStats answers, List<ExamRef> exams, RegradeImpact regradeImpact,
                           List<RelatedIssue> relatedIssues) { }

    public record OptionView(Long optionId, String optionText, Boolean isCorrect, String explanation, Integer orderIndex) { }

    public record QuestionView(Long questionId, String questionType, String difficulty, String content, String explanation, String status,
                               Long lockVersion, Integer scoringVersion, List<OptionView> options, JsonNode answerKey,
                               JsonNode questionMetadata, JsonNode essayGradingRubric) { }

    public record ManagerDetail(Long issueId, Long questionId, String issueType, String status, Long courseId,
                                String courseName, Location location, String priority, int priorityScore,
                                UserRef assignedTo, Long duplicateOfIssueId, String resolutionType,
                                String resolutionNote, UserRef resolvedBy, Instant resolvedAt, Instant createdAt,
                                Instant lastReportedAt, Instant updatedAt, long reportCount, QuestionView question,
                                List<ReportView> reports, Insights insights) { }

    /** One of the student's answers re-scored by this ticket's regrade job. */
    public record RegradeResult(Long attemptId, String examTitle, BigDecimal oldScore, BigDecimal newScore,
                                BigDecimal attemptTotalScore, BigDecimal attemptMaxScore, Instant regradedAt) { }

    /** A student sees the ticket outcome, only their own reports, and how their own scores changed. */
    public record StudentDetail(Long issueId, Long questionId, String questionContent, String issueType, String status,
                                Long duplicateOfIssueId, String resolutionType, String resolutionNote, Instant resolvedAt,
                                Instant createdAt, Instant updatedAt, long reportCount, boolean canWithdraw,
                                List<ReportView> myReports, List<RegradeResult> regradeResults) { }

    public record WithdrawResult(Long issueId, String status, long reportCount) { }

    public record ReportResult(Long issueId, Long reportId, String status, long reportCount, boolean joinedExistingIssue) { }

    public record HistoryView(Long historyId, String action, String fromStatus, String toStatus, String note,
                              UserRef actor, Instant createdAt) { }

    public record JobView(Long jobId, Long issueId, Long questionId, String resolutionType, String status,
                          Integer questionVersionFrom, Integer questionVersionTo, int totalAnswers, int processedAnswers,
                          int failedAnswers, int progressPercent, String reason, UserRef confirmedBy,
                          Instant confirmedAt, Instant finishedAt, Instant createdAt) { }

    public record ResolveResult(ManagerDetail issue, JobView regradeJob) { }
}
