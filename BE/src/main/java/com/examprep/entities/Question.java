package com.examprep.entities;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.io.Serializable;
import java.math.BigDecimal;
import java.time.Instant;

@Entity
@Table(name = "questions")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
@EntityListeners(AuditingEntityListener.class)
public class Question implements Serializable {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "question_id")
    private Long questionId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "course_id")
    private Course course;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "group_id")
    private QuestionGroup group;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "module_id")
    private Module module;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "created_by")
    private User createdBy;

    @Column(name = "question_type", nullable = false, length = 50)
    private String questionType;

    @Column(name = "difficulty", length = 50)
    private String difficulty;

    @Column(name = "content", nullable = false)
    private String content;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "question_metadata", columnDefinition = "jsonb")
    private String questionMetadata;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "answer_key", columnDefinition = "jsonb")
    private String answerKey;

    @Builder.Default
    @Column(name = "default_points", nullable = false, precision = 5, scale = 2)
    private BigDecimal defaultPoints = BigDecimal.ONE;

    @Builder.Default
    @Column(name = "source", nullable = false, length = 10)
    private String source = "MANUAL";

    @Builder.Default
    @Column(name = "creator_role", nullable = false, length = 10)
    private String creatorRole = "MANAGER";

    @Column(name = "ai_usage_log_id")
    private Long aiUsageLogId;

    @Column(name = "source_document_id")
    private Long sourceDocumentId;

    @Column(name = "source_excerpt")
    private String sourceExcerpt;

    @Column(name = "content_hash", length = 64)
    private String contentHash;

    @Builder.Default
    @Column(name = "scoring_version", nullable = false)
    private Integer scoringVersion = 1;

    @Version
    @Builder.Default
    @Column(name = "lock_version", nullable = false)
    private Long lockVersion = 0L;

    @Column(name = "ai_explanation")
    private String aiExplanation;

    @Builder.Default
    @Column(name = "status", nullable = false, length = 20)
    private String status = "ACTIVE";

    @Builder.Default
    @Column(name = "approval_status", nullable = false, length = 20)
    private String approvalStatus = "APPROVED";

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @LastModifiedDate
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Column(name = "deleted_at")
    private Instant deletedAt;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "essay_grading_rubric", columnDefinition = "jsonb")
    private String essayGradingRubric;
}
