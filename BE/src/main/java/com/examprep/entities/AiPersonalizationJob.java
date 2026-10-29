package com.examprep.entities;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.io.Serializable;
import java.time.Instant;

@Entity
@Table(name = "ai_personalization_jobs")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
/** AI-01 smart practice job; AI-02 polls it. */
public class AiPersonalizationJob implements Serializable {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "job_id")
    private Long jobId;

    @Column(name = "student_id", nullable = false)
    private Long studentId;

    @Column(name = "course_id", nullable = false)
    private Long courseId;

    @Builder.Default
    @Column(name = "type", nullable = false, length = 30)
    private String type = "SMART_PRACTICE";

    /** PROCESSING, COMPLETED or FAILED. */
    @Builder.Default
    @Column(name = "status", nullable = false, length = 20)
    private String status = "PROCESSING";

    /** Request + module statistics + AI output (questionCount, focusAreas, estimatedDifficulty). */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "analysis_json", columnDefinition = "jsonb")
    private String analysisJson;

    @Column(name = "result_exam_id")
    private Long resultExamId;

    @Column(name = "error_message")
    private String errorMessage;

    @Column(name = "estimated_tokens")
    private Integer estimatedTokens;

    @Column(name = "actual_tokens")
    private Integer actualTokens;

    @org.hibernate.annotations.CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    @Column(name = "completed_at")
    private Instant completedAt;
}
