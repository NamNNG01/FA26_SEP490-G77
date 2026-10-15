package com.examprep.entities;

import jakarta.persistence.*;
import lombok.*;

import java.io.Serializable;

/**
 * Selected options of one attempt answer.
 *
 * {@code attempt_answers.selected_option_id} stores a single option only,
 * so MULTI_CHOICE answers record every chosen option here instead
 * (one row per chosen option, unique per answer + option).
 * Created by V6__iteration1_api_support.sql; consumed by the exam-submit
 * flow in Iteration 2.
 */
@Entity
@Table(name = "attempt_answer_options",
        uniqueConstraints = @UniqueConstraint(columnNames = {"attempt_answer_id", "option_id"}))
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AttemptAnswerOption implements Serializable {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "attempt_answer_option_id")
    private Long attemptAnswerOptionId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "attempt_answer_id", nullable = false)
    private AttemptAnswer attemptAnswer;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "option_id", nullable = false)
    private AnswerOption option;
}
