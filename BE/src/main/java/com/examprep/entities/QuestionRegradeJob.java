package com.examprep.entities;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.io.Serializable;
import java.time.Instant;

/** Re-scores the finished answers of a corrected or voided question, after a manager confirms it. */
@Entity
@Table(name = "question_regrade_jobs")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
@EntityListeners(AuditingEntityListener.class)
public class QuestionRegradeJob implements Serializable {
    public static final String PENDING_CONFIRMATION = "PENDING_CONFIRMATION";
    public static final String RUNNING = "RUNNING";
    public static final String COMPLETED = "COMPLETED";
    public static final String PARTIAL_FAILED = "PARTIAL_FAILED";
    public static final String FAILED = "FAILED";
    public static final String CANCELLED = "CANCELLED";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "job_id")
    private Long jobId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "issue_id", nullable = false)
    private QuestionIssue issue;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "question_id", nullable = false)
    private Question question;

    @Column(name = "resolution_type", nullable = false, length = 40)
    private String resolutionType;

    /**
     * The answer key frozen when the job is created, so a later correction cannot change what this job
     * regrades. Null for QUESTION_VOIDED jobs (every answer gets full points).
     */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "key_snapshot", columnDefinition = "jsonb")
    private String keySnapshot;

    @Builder.Default
    @Column(name = "status", nullable = false, length = 25)
    private String status = PENDING_CONFIRMATION;

    @Column(name = "question_version_from")
    private Integer questionVersionFrom;

    @Column(name = "question_version_to", nullable = false)
    private Integer questionVersionTo;

    @Builder.Default
    @Column(name = "total_answers", nullable = false)
    private Integer totalAnswers = 0;

    @Builder.Default
    @Column(name = "processed_answers", nullable = false)
    private Integer processedAnswers = 0;

    @Builder.Default
    @Column(name = "failed_answers", nullable = false)
    private Integer failedAnswers = 0;

    @Column(name = "reason")
    private String reason;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "confirmed_by")
    private User confirmedBy;

    @Column(name = "confirmed_at")
    private Instant confirmedAt;

    @Column(name = "finished_at")
    private Instant finishedAt;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @LastModifiedDate
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;
}
