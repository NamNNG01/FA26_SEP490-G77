package com.examprep.dto.discussion;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

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
}
