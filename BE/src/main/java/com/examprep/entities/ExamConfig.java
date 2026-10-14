package com.examprep.entities;

import jakarta.persistence.*;
import lombok.*;

import java.io.Serializable;

@Entity
@Table(name = "exam_config")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ExamConfig implements Serializable {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "config_id")
    private Long configId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "exam_id", nullable = false)
    private Exam exam;

    @Column(name = "question_type", nullable = false, length = 50)
    private String questionType;

    @Column(name = "number_of_questions", nullable = false)
    private Integer numberOfQuestions;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "module_id")
    private Module module;

    @Column(name = "difficulty", length = 50)
    private String difficulty;
}
