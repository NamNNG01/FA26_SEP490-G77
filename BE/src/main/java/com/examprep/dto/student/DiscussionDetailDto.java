package com.examprep.dto.student;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;
import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class DiscussionDetailDto {
    private Long discussionId;
    private String title;
    private String content;
    private String tag;
    private DiscussionItemDto.AuthorDto author;
    private long upvoteCount;
    private long commentCount;
    @JsonProperty("isPinned")
    private boolean isPinned;
    @JsonProperty("isUpvoted")
    private boolean isUpvoted;
    private boolean isBookmarked;
    private boolean isAuthor;
    @JsonProperty("isClosed")
    private boolean isClosed;
    private Instant createdAt;
    private Instant updatedAt;
    private List<CommentDto> comments;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class CommentDto {
        private Long commentId;
        private String content;
        private DiscussionItemDto.AuthorDto author;
        private boolean isAccepted;
        private boolean isAnonymous;
        private Instant createdAt;
    }
}
