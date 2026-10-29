package com.examprep.entities;

import jakarta.persistence.*;
import lombok.*;

import java.io.Serializable;
import java.time.Instant;

@Entity
@Table(name = "quiz_generation_jobs")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class QuizGenerationJob implements Serializable {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "job_id")
    private Long jobId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "doc_id", nullable = false)
    private Document document;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "course_id")
    private Course course;

    @Column(name = "question_count", nullable = false)
    private Integer questionCount;

    @Column(name = "difficulty", nullable = false, length = 20)
    private String difficulty;

    @Column(name = "source_lesson_id")
    private Long sourceLessonId;

    @Column(name = "status", nullable = false, length = 20)
    private String status;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "result_exam_id")
    private Exam resultExam;

    @Column(name = "error_message")
    private String errorMessage;

    @Column(name = "estimated_tokens")
    private Integer estimatedTokens;

    @Column(name = "actual_tokens")
    private Integer actualTokens;

    @Column(name = "progress", nullable = false)
    private Integer progress;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "ai_usage_log_id")
    private AiUsageLog aiUsageLog;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Column(name = "completed_at")
    private Instant completedAt;
}
