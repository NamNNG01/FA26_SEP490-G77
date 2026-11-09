package com.examprep.entities;

import jakarta.persistence.*;
import lombok.*;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.io.Serializable;
import java.time.Instant;
import java.util.Set;

/** One manager ticket for a reported question; every student report of it while open joins it. */
@Entity
@Table(name = "question_issues")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
@EntityListeners(AuditingEntityListener.class)
public class QuestionIssue implements Serializable {
    public static final String PENDING = "PENDING";
    public static final String IN_PROGRESS = "IN_PROGRESS";
    public static final String RESOLVED = "RESOLVED";
    public static final String REJECTED = "REJECTED";
    public static final String DUPLICATE = "DUPLICATE";
    public static final Set<String> OPEN = Set.of(PENDING, IN_PROGRESS);
    public static final Set<String> STATUSES = Set.of(PENDING, IN_PROGRESS, RESOLVED, REJECTED, DUPLICATE);
    public static final Set<String> TYPES = Set.of("WRONG_CONTENT", "WRONG_ANSWER", "WRONG_EXPLANATION",
            "AI_EXPLANATION_ERROR", "MISSING_MEDIA", "OTHER");
    public static final Set<String> RESOLUTION_TYPES = Set.of("CONTENT_CORRECTED", "EXPLANATION_CORRECTED",
            "AI_EXPLANATION_CORRECTED", "ANSWER_CORRECTED", "RUBRIC_CORRECTED", "QUESTION_VOIDED", "OTHER_CORRECTION");

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "issue_id")
    private Long issueId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "question_id", nullable = false)
    private Question question;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "course_id")
    private Course course;

    @Column(name = "issue_type", nullable = false, length = 30)
    private String issueType;

    @Builder.Default
    @Column(name = "status", nullable = false, length = 20)
    private String status = PENDING;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "assigned_to")
    private User assignedTo;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "duplicate_of_issue_id")
    private QuestionIssue duplicateOf;

    @Column(name = "resolution_type", length = 40)
    private String resolutionType;

    @Column(name = "resolution_note")
    private String resolutionNote;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "resolved_by")
    private User resolvedBy;

    @Column(name = "resolved_at")
    private Instant resolvedAt;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @LastModifiedDate
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    public boolean isOpen() {
        return OPEN.contains(status);
    }
}
