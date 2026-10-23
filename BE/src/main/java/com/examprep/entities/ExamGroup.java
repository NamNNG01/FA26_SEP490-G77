package com.examprep.entities;

import jakarta.persistence.*;
import lombok.*;

import java.io.Serializable;
import java.math.BigDecimal;

@Entity
@Table(name = "exam_groups")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ExamGroup implements Serializable {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "exam_group_id")
    private Long examGroupId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "exam_id", nullable = false)
    private Exam exam;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "group_id", nullable = false)
    private QuestionGroup group;

    @Builder.Default
    @Column(name = "order_index", nullable = false)
    private Integer orderIndex = 0;
}
