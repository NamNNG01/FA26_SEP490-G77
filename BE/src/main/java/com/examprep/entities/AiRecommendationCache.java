package com.examprep.entities;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.io.Serializable;
import java.time.Instant;

@Entity
@Table(name = "ai_recommendation_cache")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
/** AI-03 / AI-04 cached result per (student, course, type, period). */
public class AiRecommendationCache implements Serializable {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "cache_id")
    private Long cacheId;

    @Column(name = "student_id", nullable = false)
    private Long studentId;

    @Column(name = "course_id", nullable = false)
    private Long courseId;

    /** RECOMMENDATION or WEAKNESS_REPORT. */
    @Column(name = "type", nullable = false, length = 30)
    private String type;

    @Column(name = "period", length = 20)
    private String period;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "result_json", nullable = false, columnDefinition = "jsonb")
    private String resultJson;

    @Column(name = "generated_at", nullable = false)
    private Instant generatedAt;

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    @Column(name = "actual_tokens")
    private Integer actualTokens;
}
