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
 * One question of a Module Practice session (table {@code question_practice_session_questions}).
 *
 * <p>The row freezes {@code display_snapshot} (what the student is shown) and {@code key_snapshot}
 * (what grading needs) at session start, exactly like {@code attempt_answers} does for an exam, so a
 * question edited or archived mid-session cannot change the running practice.</p>
 */
@Entity
@Table(name = "question_practice_session_questions")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class QuestionPracticeSessionQuestion implements Serializable {

    /** No attempt submitted yet; the only practice-specific grading state. */
    public static final String GRADING_UNANSWERED = "UNANSWERED";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "session_question_id")
    private Long sessionQuestionId;

    // The database declares ON DELETE CASCADE (V68); the mapping declares it too so a schema
    // generated from the entities matches the migrated one and the reset works in both.
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "session_id", nullable = false)
    @OnDelete(action = OnDeleteAction.CASCADE)
    private QuestionPracticeSession session;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "question_id", nullable = false)
    private Question question;

    @Column(name = "order_index", nullable = false)
    private Integer orderIndex;

    /** {@code questions.lock_version} at session start: the provenance of the frozen snapshots. */
    @Builder.Default
    @Column(name = "question_lock_version", nullable = false)
    private Long questionLockVersion = 0L;

    @Builder.Default
    @Column(name = "scoring_version", nullable = false)
    private Integer scoringVersion = 1;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "display_snapshot", nullable = false, columnDefinition = "jsonb")
    private String displaySnapshot;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "key_snapshot", nullable = false, columnDefinition = "jsonb")
    private String keySnapshot;

    @Builder.Default
    @Column(name = "attempt_count", nullable = false)
    private Integer attemptCount = 0;

    @Column(name = "latest_is_correct")
    private Boolean latestIsCorrect;

    @Column(name = "latest_score", precision = 5, scale = 2)
    private BigDecimal latestScore;

    @Builder.Default
    @Column(name = "grading_status", nullable = false, length = 15)
    private String gradingStatus = GRADING_UNANSWERED;

    @Column(name = "first_answered_at")
    private Instant firstAnsweredAt;

    @Column(name = "last_answered_at")
    private Instant lastAnsweredAt;

    public boolean isAnswered() {
        return attemptCount != null && attemptCount > 0;
    }
}
