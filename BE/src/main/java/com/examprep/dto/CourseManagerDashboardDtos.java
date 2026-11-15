package com.examprep.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;

/**
 * DASH-05: the Course Manager dashboard v2 (summary, course panel, exam panel). Every figure is
 * scoped to the caller: the courses they manage (course manager or co-manager) and the exams they
 * created in those courses. Scores are percentages of the attempt's own frozen max score, so they
 * are comparable across exams; {@code null} means "no data" and is never 0.
 *
 * <p>Pass rates count a graded attempt as passed when it reached at least
 * {@link #PASS_THRESHOLD_PERCENT} of the exam's max score — the platform has no per-exam pass mark
 * (V23 dropped it), so the dashboard states the threshold it uses.</p>
 */
public final class CourseManagerDashboardDtos {

    /** A graded attempt counts as passed from this share of the exam's max score. */
    public static final int PASS_THRESHOLD_PERCENT = 50;

    private CourseManagerDashboardDtos() {
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Summary {
        private long managedCourses;
        /** Distinct students with an ACTIVE enrollment in the managed courses. */
        private long activeStudents;
        private MyExams myExams;
        /** Submitted attempts of my exams in the last 7 days. */
        private long submittedAttempts7d;
        /** Average percentage over my graded attempts, all time; null when there is none. */
        private BigDecimal avgScore;
        /** Share of my graded attempts at or above {@link #PASS_THRESHOLD_PERCENT}%, all time. */
        private BigDecimal passRate;
        /** Attempts of my exams still waiting for grading (SUBMITTED or GRADING). */
        private long pendingGrading;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class MyExams {
        private long total;
        private long published;
        private long draft;
        private long archived;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class CourseStat {
        private Long courseId;
        private String title;
        private long activeStudents;
        /** Exams I created in this course. */
        private long myExamCount;
        private long submittedAttempts;
        private BigDecimal avgScore;
        private BigDecimal passRate;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ExamStat {
        private Long examId;
        private String title;
        private Long courseId;
        private String courseTitle;
        /** DRAFT, PUBLISHED or ARCHIVED. */
        private String status;
        private long submittedAttempts;
        private BigDecimal avgScore;
        private BigDecimal passRate;
        /** Average minutes from start to submit; null when no attempt was submitted. */
        private Integer avgDurationMinutes;
        private long pendingGrading;
    }
}
