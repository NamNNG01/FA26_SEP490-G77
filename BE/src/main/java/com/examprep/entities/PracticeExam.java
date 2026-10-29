package com.examprep.entities;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.io.Serializable;
import java.time.Instant;

@Entity
@Table(name = "practice_exams")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
/** PQ-01 custom practice exam owned by a student; the paper itself is an {@link Exam} with mode PRACTICE. */
public class PracticeExam implements Serializable {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "practice_exam_id")
    private Long practiceExamId;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "course_id", nullable = false)
    private Long courseId;

    @Column(name = "title", nullable = false, length = 255)
    private String title;

    @Column(name = "question_count", nullable = false)
    private Integer questionCount;

    @Column(name = "duration_minutes", nullable = false)
    private Integer durationMinutes;

    @Column(name = "difficulty", length = 20)
    private String difficulty;

    /** Module ids the questions were drawn from ("categoryIds" in the API). */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "category_ids", columnDefinition = "jsonb")
    private String categoryIds;

    @Builder.Default
    @Column(name = "status", nullable = false, length = 20)
    private String status = "READY";

    @Column(name = "exam_id")
    private Long examId;

    @org.hibernate.annotations.CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;
}
