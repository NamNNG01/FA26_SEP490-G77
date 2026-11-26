package com.examprep.dto.student;

import com.examprep.entities.User;
import com.fasterxml.jackson.annotation.JsonIgnore;
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
    private String excerpt;
    /** question, tip or announcement. */
    private String tag;
    private AuthorDto author;
    private long upvoteCount;
    private long commentCount;
    @JsonProperty("isPinned")
    private boolean isPinned;
    @JsonProperty("isUpvoted")
    private boolean isUpvoted;
    @JsonProperty("isBookmarked")
    private boolean isBookmarked;
    @JsonProperty("isAuthor")
    private boolean isAuthor;
    @JsonProperty("isClosed")
    private boolean isClosed;
    private String imageUrl;
    private String approvalStatus;
    private String status;
    private Instant createdAt;
    private Instant lastCommentAt;
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
        /** Shown instead of the real identity of an anonymous post or comment. */
        public static final String ANONYMOUS_DISPLAY_NAME = "Anonymous Student";

        private Long userId;
        private String displayName;
        private String avatarUrl;
        private String role;

        /**
         * The author as readers see them. An anonymous author keeps no identifying field — no user
         * id, no avatar and no role; only the caller's own {@code isAuthor} flag (or the comment's
         * {@code isAnonymous} flag) tells the writer apart from the crowd.
         */
        public static AuthorDto of(User user, boolean anonymous) {
            return new AuthorDto(
                    anonymous ? null : user.getUserId(),
                    anonymous ? ANONYMOUS_DISPLAY_NAME : user.getFullName(),
                    anonymous ? null : user.getAvatarUrl(),
                    anonymous ? null : user.getRoleName());
        }
    }

}
