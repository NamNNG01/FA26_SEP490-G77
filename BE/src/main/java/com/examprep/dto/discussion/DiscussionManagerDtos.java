package com.examprep.dto.discussion;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;
import java.util.List;

public class DiscussionManagerDtos {

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class CreateDiscussionRequest {
        @NotBlank(message = "Title is required")
        @Size(max = 200, message = "Title must not exceed 200 characters")
        private String title;

        @NotBlank(message = "Content is required")
        @Size(max = 10000, message = "Content must not exceed 10000 characters")
        private String content;

        private String tag; // announcement, question, tip

        @Size(max = 1000, message = "Image URL must not exceed 1000 characters")
        private String imageUrl;

        private Boolean isPinned;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class RejectDiscussionRequest {
        @NotBlank(message = "Rejection reason is required")
        @Size(max = 1000, message = "Reason must not exceed 1000 characters")
        private String reason;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class UpdatePinRequest {
        @NotNull(message = "isPinned is required")
        private Boolean isPinned;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class UpdateCommentStatusRequest {
        @NotBlank(message = "Status is required (VISIBLE or HIDDEN)")
        private String status;

        @Size(max = 500, message = "Reason must not exceed 500 characters")
        private String reason;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class BulkIdsRequest {
        @NotEmpty(message = "Discussion IDs are required")
        private List<Long> discussionIds;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class BulkRejectRequest {
        @NotEmpty(message = "Discussion IDs are required")
        private List<Long> discussionIds;

        @NotBlank(message = "Rejection reason is required")
        @Size(max = 1000, message = "Reason must not exceed 1000 characters")
        private String reason;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ResolveReportRequest {
        @NotBlank(message = "Action is required (HIDE_AND_RESOLVE or DISMISS)")
        private String action;

        @Size(max = 500, message = "Note must not exceed 500 characters")
        private String note;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class MuteUserRequest {
        @NotNull(message = "Mute days is required")
        @Min(value = 1, message = "Mute days must be at least 1")
        private Integer days;

        @NotBlank(message = "Mute reason is required")
        @Size(max = 500, message = "Reason must not exceed 500 characters")
        private String reason;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class DiscussionReportItemDto {
        private Long reportId;
        private String targetType;
        private Long discussionId;
        private String discussionTitle;
        private Long commentId;
        private String targetContent;
        private Long targetAuthorId;
        private String targetAuthorName;
        private Long reporterId;
        private String reporterName;
        private String reason;
        private String status;
        private String resolutionNote;
        private Instant createdAt;
        private Instant resolvedAt;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ModerationSummaryDto {
        private long pendingDiscussionsCount;
        private long pendingReportsCount;
        private List<String> rejectionTemplates;
    }
}
