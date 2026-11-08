package com.examprep.entities;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.io.Serializable;
import java.math.BigDecimal;
import java.time.Instant;

@Entity
@Table(name = "exams")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
@EntityListeners(AuditingEntityListener.class)
public class Exam implements Serializable {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "exam_id")
    private Long examId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "course_id")
    private Course course;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "module_id")
    private Module module;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "created_by", nullable = false)
    private User createdBy;

    @Column(name = "title", nullable = false, length = 255)
    private String title;

    @Column(name = "description")
    private String description;

    @Column(name = "duration_minutes", nullable = false)
    private Integer durationMinutes;

    @Column(name = "generation_type", nullable = false, length = 50)
    private String generationType;

    @Builder.Default
    @Column(name = "max_score", nullable = false, precision = 7, scale = 2)
    private BigDecimal maxScore = BigDecimal.TEN;

    @Builder.Default
    @Column(name = "status", nullable = false, length = 20)
    private String status = "DRAFT";

    @Column(name = "published_at")
    private Instant publishedAt;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    // A hidden module hides its exams from students too.
    public boolean isVisibleToStudents() { return "PUBLISHED".equals(status) && (module == null || !module.isHidden()); }

    public static final String MODE_EXAM = "EXAM";
    public static final String MODE_MATERIAL_QUIZ = "MATERIAL_QUIZ";
    /** A course exam reserved for contests: hidden from students' course exams, taken only through its contest. */
    public static final String MODE_CONTEST = "CONTEST";
    public static final String MODE_PRACTICE_EXAM = "PRACTICE_EXAM";
    public static final String MODE_PRACTICE = "PRACTICE";

    /** EXAM/CONTEST for course exams; PRACTICE_EXAM (PQ-01) and SMART_PRACTICE (AI-01) are a student's own generated exams. PRACTICE is review-from-notebook only. */
    @Builder.Default
    @Column(name = "mode", nullable = false, length = 30)
    private String mode = MODE_EXAM;

    @Column(name = "ai_job_id")
    private Long aiJobId;

    /** PQ-01 / AI-01 config stored at creation time: examType, questionCount, difficulty, moduleIds. */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "practice_config", columnDefinition = "jsonb")
    private String practiceConfig;

    /** PQ-01 exam: PRACTICE_EXAM (taken as an exam) or PRACTICE with a practice_config (taken as practice; notebook reviews have none). */
    public boolean isPq01() {
        return MODE_PRACTICE_EXAM.equals(mode) || (MODE_PRACTICE.equals(mode) && practiceConfig != null);
    }

    /** Computed: true when mode is not EXAM (backward compat for manager ExamResponse). */
    public boolean getIsPractice() {
        return !MODE_EXAM.equals(mode);
    }

    public void setIsPractice(Boolean isPractice) {
        // no-op for backward compatibility
    }

    public static class ExamBuilder {
        public ExamBuilder isPractice(Boolean isPractice) {
            // no-op for backward compatibility with existing builders
            return this;
        }
    }
}
