package com.examprep.entities;

import jakarta.persistence.*;
import lombok.*;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.io.Serializable;
import java.time.Instant;

@Entity
@Table(name = "discussions")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
@EntityListeners(AuditingEntityListener.class)
public class Discussion implements Serializable {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "discussion_id")
    private Long discussionId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "question_id")
    private Question question;

    @Column(name = "title", nullable = false, length = 500)
    private String title;

    @Column(name = "content", nullable = false, columnDefinition = "TEXT")
    private String content;

    public static final String STATUS_OPEN = "OPEN";
    public static final String STATUS_CLOSED = "CLOSED";
    public static final String STATUS_HIDDEN = "HIDDEN";

    @Builder.Default
    @Column(name = "status", nullable = false, length = 20)
    private String status = STATUS_OPEN; // OPEN, CLOSED, HIDDEN

    @Builder.Default
    @Column(name = "is_pinned", nullable = false)
    private Boolean isPinned = false;

    @Builder.Default
    @Column(name = "view_count", nullable = false)
    private Integer viewCount = 0;

    @Builder.Default
    @Column(name = "comment_count", nullable = false)
    private Integer commentCount = 0;

    public static final String APPROVAL_PENDING = "PENDING";
    public static final String APPROVAL_APPROVED = "APPROVED";
    public static final String APPROVAL_REJECTED = "REJECTED";

    /** question, tip or announcement (V49). */
    @Builder.Default
    @Column(name = "tag", nullable = false, length = 20)
    private String tag = "question";

    @Builder.Default
    @Column(name = "is_anonymous", nullable = false)
    private Boolean isAnonymous = false;

    @Builder.Default
    @Column(name = "upvote_count", nullable = false)
    private Integer upvoteCount = 0;

    @Column(name = "image_url", length = 1000)
    private String imageUrl;

    @Builder.Default
    @Column(name = "approval_status", nullable = false, length = 20)
    private String approvalStatus = APPROVAL_APPROVED;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "reviewed_by")
    private User reviewedBy;

    @Column(name = "reviewed_at")
    private Instant reviewedAt;

    @Column(name = "rejection_reason", length = 1000)
    private String rejectionReason;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @LastModifiedDate
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    public boolean isClosed() {
        return STATUS_CLOSED.equalsIgnoreCase(this.status);
    }
}
