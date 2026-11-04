package com.examprep.entities;

import jakarta.persistence.*;
import lombok.*;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.io.Serializable;
import java.math.BigDecimal;
import java.time.Instant;

/**
 * Long-term practice progress of one student on one question of one module
 * (table {@code question_practice_progress}) — independent of any single session.
 *
 * <p>{@code total_attempts} counts every submission, including answers still waiting for the AI
 * grader; {@code graded_attempts} counts only finalized ones, and
 * {@code correct + wrong &lt;= graded &lt;= total} is enforced by the database.</p>
 */
@Entity
@Table(name = "question_practice_progress")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
@EntityListeners(AuditingEntityListener.class)
public class QuestionPracticeProgress implements Serializable {

    public static final String MASTERY_NEW = "NEW";
    public static final String MASTERY_LEARNING = "LEARNING";
    public static final String MASTERY_MASTERED = "MASTERED";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "progress_id")
    private Long progressId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "course_id", nullable = false)
    private Course course;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "module_id", nullable = false)
    private Module module;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "question_id", nullable = false)
    private Question question;

    @Builder.Default
    @Column(name = "total_attempts", nullable = false)
    private Integer totalAttempts = 0;

    @Builder.Default
    @Column(name = "graded_attempts", nullable = false)
    private Integer gradedAttempts = 0;

    @Builder.Default
    @Column(name = "correct_attempts", nullable = false)
    private Integer correctAttempts = 0;

    @Builder.Default
    @Column(name = "wrong_attempts", nullable = false)
    private Integer wrongAttempts = 0;

    /** Result of the latest <em>finalized</em> attempt; null while the latest one is still ungraded. */
    @Column(name = "last_is_correct")
    private Boolean lastIsCorrect;

    @Column(name = "best_score", precision = 5, scale = 2)
    private BigDecimal bestScore;

    @Builder.Default
    @Column(name = "mastery_status", nullable = false, length = 20)
    private String masteryStatus = MASTERY_NEW;

    @Column(name = "first_answered_at")
    private Instant firstAnsweredAt;

    @Column(name = "last_answered_at")
    private Instant lastAnsweredAt;

    @LastModifiedDate
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;
}
