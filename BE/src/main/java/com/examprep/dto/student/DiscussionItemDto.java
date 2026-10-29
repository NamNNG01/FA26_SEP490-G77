package com.examprep.dto.student;

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
    private boolean isPinned;
    private boolean isUpvoted;
    private boolean isAuthor;
    private Instant createdAt;
    private Instant lastCommentAt;
    private CourseRefDto course;

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
