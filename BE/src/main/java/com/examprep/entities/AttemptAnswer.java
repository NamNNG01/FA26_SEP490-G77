package com.examprep.entities;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.io.Serializable;
import java.math.BigDecimal;
import java.time.Instant;

@Entity
@Table(name = "attempt_answers")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AttemptAnswer implements Serializable {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "attempt_answer_id")
    private Long attemptAnswerId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "attempt_id", nullable = false)
    private ExamAttempt attempt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "question_id", nullable = false)
    private Question question;

    @Deprecated
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "selected_option_id")
    private AnswerOption selectedOption;

    @Deprecated
    @Column(name = "essay_answer")
    private String essayAnswer;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "response", columnDefinition = "jsonb")
    private String response;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "display_snapshot", columnDefinition = "jsonb")
    private String displaySnapshot;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "key_snapshot", columnDefinition = "jsonb")
    private String keySnapshot;

    @Builder.Default
    @Column(name = "draft_seq", nullable = false)
    private Integer draftSeq = 0;

    @Builder.Default
    @Column(name = "weight_snapshot", nullable = false, precision = 10, scale = 2)
    private BigDecimal weightSnapshot = BigDecimal.ONE;

    @Builder.Default
    @Column(name = "question_version")
    private Integer questionVersion = 1;

    @Builder.Default
    @Column(name = "grading_status", nullable = false, length = 15)
    private String gradingStatus = "AUTO";

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "ai_criteria_scores", columnDefinition = "jsonb")
    private String aiCriteriaScores;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "ai_feedback_json", columnDefinition = "jsonb")
    private String aiFeedbackJson;

    @Builder.Default
    @Column(name = "grade_retry_count", nullable = false)
    private Integer gradeRetryCount = 0;

    @Column(name = "graded_at")
    private Instant gradedAt;

    @Column(name = "is_correct")
    private Boolean isCorrect;

    @Column(name = "score_earned", precision = 5, scale = 2)
    private BigDecimal scoreEarned;
}
