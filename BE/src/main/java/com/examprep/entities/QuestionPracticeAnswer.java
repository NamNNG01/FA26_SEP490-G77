package com.examprep.entities;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.OnDelete;
import org.hibernate.annotations.OnDeleteAction;
import org.hibernate.type.SqlTypes;

import java.io.Serializable;
import java.math.BigDecimal;
import java.time.Instant;

/**
 * One submitted attempt of one practice question (table {@code question_practice_answers}).
 *
 * <p>Rows are append-only: {@code attempt_number} rises and an earlier attempt is never updated, so
 * the answer history of a question survives every later submission. {@code response} is {@code jsonb}
 * because the payload differs per question type (see {@code AnswerResponseValidator}).</p>
 */
@Entity
@Table(name = "question_practice_answers")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class QuestionPracticeAnswer implements Serializable {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "practice_answer_id")
    private Long practiceAnswerId;

    // Cascade declared in the database by V68 and mirrored here, so the reset's two bulk deletes are
    // enough whatever generated the schema.
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "session_question_id", nullable = false)
    @OnDelete(action = OnDeleteAction.CASCADE)
    private QuestionPracticeSessionQuestion sessionQuestion;

    @Column(name = "attempt_number", nullable = false)
    private Integer attemptNumber;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "response", columnDefinition = "jsonb")
    private String response;

    @Column(name = "is_correct")
    private Boolean isCorrect;

    @Column(name = "score_earned", precision = 5, scale = 2)
    private BigDecimal scoreEarned;

    @Builder.Default
    @Column(name = "grading_status", nullable = false, length = 15)
    private String gradingStatus = "AUTO";

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "feedback", columnDefinition = "jsonb")
    private String feedback;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "criteria_scores", columnDefinition = "jsonb")
    private String criteriaScores;

    @Column(name = "grading_error", length = 30)
    private String gradingError;

    @Column(name = "grading_locked_at")
    private Instant gradingLockedAt;

    @Column(name = "graded_at")
    private Instant gradedAt;

    @Builder.Default
    @Column(name = "time_spent_seconds", nullable = false)
    private Integer timeSpentSeconds = 0;

    @Builder.Default
    @Column(name = "answered_at", nullable = false)
    private Instant answeredAt = Instant.now();

    /** Client-generated idempotency key; unique per session question while not null. */
    @Column(name = "request_key", length = 128)
    private String requestKey;
}
