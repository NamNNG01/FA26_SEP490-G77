package com.examprep.entities;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.OnDelete;
import org.hibernate.annotations.OnDeleteAction;

import java.io.Serializable;
import java.time.Instant;

/**
 * Stored Deep AI Explanation (MP-10) keyed by {@code practice_answer_id}, kept in its own table
 * so {@code question_practice_answers} stays aligned with V68.
 */
@Entity
@Table(name = "question_practice_deep_explanations")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class QuestionPracticeDeepExplanation implements Serializable {

    @Id
    @Column(name = "practice_answer_id")
    private Long practiceAnswerId;

    @OneToOne(fetch = FetchType.LAZY)
    @MapsId
    @JoinColumn(name = "practice_answer_id", nullable = false)
    @OnDelete(action = OnDeleteAction.CASCADE)
    private QuestionPracticeAnswer practiceAnswer;

    @Column(name = "explanation", nullable = false)
    private String explanation;

    @Builder.Default
    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();
}
