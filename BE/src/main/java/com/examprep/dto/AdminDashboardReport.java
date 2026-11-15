package com.examprep.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.util.List;

/**
 * DASH-04: the admin dashboard report for one period, aggregated from the real platform data
 * (payments, users, courses, AI usage logs). The period filter is {@code granularity} + {@code from}
 * / {@code to} (see the controller); {@code revenueSeries} always carries one entry per period of
 * the filter so empty periods still appear on the chart.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AdminDashboardReport {

    private Summary summary;
    private List<RevenuePoint> revenueSeries;
    private RevenueBySource revenueBySource;
    /** Top 5 courses, all time, ranked by the requested sort. */
    private List<TopCourse> topCourses;
    /** Newest settled AI requests of the period (capped), newest first. */
    private List<AiUsageEntry> aiLogs;
    private AiLogTotals aiLogTotals;
    /** First calendar day the platform has data (users), {@code YYYY-MM-DD} — bounds the picker. */
    private String dataStart;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Summary {
        /** Collected payments of the period, after discounts (whole VND). */
        private BigDecimal netRevenue;
        private Users users;
        private Courses courses;
        private Ai ai;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Users {
        private long total;
        private long students;
        private long courseManagers;
        private long admins;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Courses {
        /** Published courses. */
        private long active;
        private long total;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Ai {
        /** Input + output tokens of every settled request in the period. */
        private long tokensUsed;
    }

    /** One bucket of the trend chart: {@code YYYY-MM-DD}, {@code YYYY-MM} or {@code YYYY}. */
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class RevenuePoint {
        private String period;
        private BigDecimal courseSales;
        private BigDecimal aiSubscription;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class RevenueBySource {
        private BigDecimal courseSales;
        private BigDecimal aiSubscription;
        /** Revenue of each subscription plan in the period (plan name at checkout). */
        private List<PlanRevenue> aiPlans;
        /** Up to 3 best-selling courses of the period by course-sales revenue. */
        private List<CourseRevenue> topSellingCourses;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class PlanRevenue {
        private String plan;
        private BigDecimal revenue;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class CourseRevenue {
        private String title;
        private BigDecimal revenue;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class TopCourse {
        private Long courseId;
        private String title;
        private BigDecimal revenue;
        private long enrollments;
        /** PUBLISHED or DRAFT. */
        private String status;
    }

    /** One row of the AI usage log table: {@code time} is a server-local ISO date-time string. */
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class AiUsageEntry {
        private String id;
        private String time;
        private String user;
        /** Human label of the request purpose (FLASHCARD_GENERATE, ESSAY_GRADING, ...). */
        private String feature;
        private long tokens;
        private boolean success;
    }

    /** Counts of the period behind {@code aiLogs}, which only carries the newest entries. */
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class AiLogTotals {
        private long requests;
        private long failed;
        private int shown;
    }
}
