package com.examprep.dto.student;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class DiscussionItemDto {
    private Long discussionId;
    private String title;
    private String tag; // question, tip
    private String excerpt;
    private AuthorDto author;
    private long upvoteCount;
    private long commentCount;
    @JsonProperty("isPinned")
    private boolean isPinned;
    @JsonProperty("isUpvoted")
    private boolean isUpvoted;
    @JsonProperty("isAuthor")
    private boolean isAuthor;
    @JsonProperty("isClosed")
    private boolean isClosed;
    private String imageUrl;
    private String approvalStatus;
    private Instant createdAt;
    private Instant lastCommentAt;
    private CourseRefDto course;

    public boolean isAuthor() {
        return isAuthor;
    }

    public void setIsAuthor(boolean isAuthor) {
        this.isAuthor = isAuthor;
    }

    public boolean isClosed() {
        return isClosed;
    }

    public void setIsClosed(boolean isClosed) {
        this.isClosed = isClosed;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class AuthorDto {
        private Long userId;
        private String displayName;
        private String avatarUrl;
        private String role;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class CourseRefDto {
        private Long courseId;
        private String title;
    }
}
