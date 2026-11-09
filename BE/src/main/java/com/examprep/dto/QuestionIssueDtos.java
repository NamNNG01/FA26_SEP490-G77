package com.examprep.dto;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.List;
import java.util.Map;

/** Question issue reports (student) and the manager ticket queue with its regrade jobs. */
public final class QuestionIssueDtos {
    private QuestionIssueDtos() { }

    // ------------------------------------------------------------------ requests

    public record ReportRequest(
            @NotNull Long questionId,
            @NotBlank String issueType,
            @NotBlank @Size(min = 10, max = 3000) String description,
            @Size(max = 1000) String attachmentUrl) { }

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

    public record ListItem(Long issueId, Long questionId, String questionContent, String issueType, String status,
                           Long courseId, String courseName, long reportCount, UserRef assignedTo,
                           Instant createdAt, Instant updatedAt) { }

    public record ReportView(Long reportId, Long userId, String studentName, String issueType, String description,
                             String attachmentUrl, Instant createdAt) { }

    public record OptionView(Long optionId, String optionText, Boolean isCorrect, String explanation, Integer orderIndex) { }

    public record QuestionView(Long questionId, String questionType, String content, String explanation, String status,
                               Long lockVersion, Integer scoringVersion, List<OptionView> options, JsonNode answerKey,
                               JsonNode questionMetadata, JsonNode essayGradingRubric) { }

    public record ManagerDetail(Long issueId, Long questionId, String issueType, String status, Long courseId,
                                String courseName, UserRef assignedTo, Long duplicateOfIssueId, String resolutionType,
                                String resolutionNote, UserRef resolvedBy, Instant resolvedAt, Instant createdAt,
                                Instant updatedAt, long reportCount, QuestionView question, List<ReportView> reports) { }

    /** A student sees the ticket outcome and only their own reports. */
    public record StudentDetail(Long issueId, Long questionId, String questionContent, String issueType, String status,
                                Long duplicateOfIssueId, String resolutionType, String resolutionNote, Instant resolvedAt,
                                Instant createdAt, Instant updatedAt, long reportCount, List<ReportView> myReports) { }

    public record ReportResult(Long issueId, Long reportId, String status, long reportCount, boolean joinedExistingIssue) { }

    public record HistoryView(Long historyId, String action, String fromStatus, String toStatus, String note,
                              UserRef actor, Instant createdAt) { }

    public record JobView(Long jobId, Long issueId, Long questionId, String resolutionType, String status,
                          Integer questionVersionFrom, Integer questionVersionTo, int totalAnswers, int processedAnswers,
                          int failedAnswers, int progressPercent, String reason, UserRef confirmedBy,
                          Instant confirmedAt, Instant finishedAt, Instant createdAt) { }

    public record ResolveResult(ManagerDetail issue, JobView regradeJob) { }
}
