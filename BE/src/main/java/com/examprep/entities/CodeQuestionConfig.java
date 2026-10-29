package com.examprep.entities;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.io.Serializable;
import java.time.Instant;

@Entity
@Table(name = "code_question_configs")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CodeQuestionConfig implements Serializable {
    @Id
    @Column(name = "question_id")
    private Long questionId;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "allowed_languages", nullable = false, columnDefinition = "jsonb")
    private String allowedLanguages;

    @Column(name = "code_template")
    private String codeTemplate;

    @Column(name = "time_limit_ms", nullable = false)
    private Integer timeLimitMs;

    @Column(name = "memory_limit_kb", nullable = false)
    private Integer memoryLimitKb;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;
}
