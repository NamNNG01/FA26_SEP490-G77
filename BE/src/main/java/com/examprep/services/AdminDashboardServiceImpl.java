package com.examprep.services;

import com.examprep.dto.AdminDashboardReport;
import com.examprep.entities.AiUsageLog;
import com.examprep.entities.Course;
import com.examprep.entities.Payment;
import com.examprep.entities.SubscriptionPlan;
import com.examprep.entities.User;
import com.examprep.exceptions.BadRequestException;
import com.examprep.repositories.AiUsageLogRepository;
import com.examprep.repositories.CourseRepository;
import com.examprep.repositories.EnrollmentRepository;
import com.examprep.repositories.PaymentRepository;
import com.examprep.repositories.SubscriptionPlanRepository;
import com.examprep.repositories.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.DateTimeException;
import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * DASH-04. Every figure comes from the database: collected payments (course sales and subscription
 * plans), accounts, courses, enrollment rows and settled AI usage logs. Nothing is estimated.
 *
 * <p>Periods are the server's calendar days/months/years ({@link #ZONE}); the series always
 * carries one entry per period of the filter so empty periods still show on the chart.</p>
 */
@Service
@RequiredArgsConstructor
public class AdminDashboardServiceImpl implements AdminDashboardService {

    /** The AI log table shows the newest entries; the totals beside it count the whole period. */
    static final int AI_LOG_LIMIT = 200;
    static final int TOP_COURSES = 5;
    static final int TOP_SELLING_COURSES = 3;

    private static final ZoneId ZONE = ZoneId.systemDefault();
    private static final DateTimeFormatter LOCAL_DATE_TIME = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss");
    private static final Set<String> GRANULARITIES = Set.of("day", "month", "year");
    private static final Set<String> SORTS = Set.of("revenue", "enrollments");
    /** Display labels of the AI request purposes the platform writes (unknown purposes stay raw). */
    private static final Map<String, String> FEATURE_LABELS = Map.of(
            "FLASHCARD_GENERATE", "Flashcard generation",
            "ESSAY_GRADING", "Answer grading",
            "EXPLANATION", "Answer explanation",
            "QUIZ_GENERATION", "Quiz generation",
            "SMART_PRACTICE", "Smart practice",
            "RECOMMENDATION", "Recommendations",
            "WEAKNESS_REPORT", "Weakness report");

    private final PaymentRepository payments;
    private final AiUsageLogRepository aiLogs;
    private final UserRepository users;
    private final CourseRepository courses;
    private final EnrollmentRepository enrollments;
    private final SubscriptionPlanRepository plans;

    @Override
    @Transactional(readOnly = true)
    public AdminDashboardReport report(String granularity, String from, String to, String sortBy) {
        String g = normalize(granularity, GRANULARITIES, "day", "granularity must be day, month or year");
        String sort = normalize(sortBy, SORTS, "revenue", "sortBy must be revenue or enrollments");
        LocalDate start = parsePeriod(from, g, true);
        LocalDate end = parsePeriod(to, g, false);
        if (end.isBefore(start)) {
            throw new BadRequestException("from must be on or before to");
        }
        Instant fromInstant = start.atStartOfDay(ZONE).toInstant();
        Instant toInstant = end.plusDays(1).atStartOfDay(ZONE).toInstant();

        // ---- Revenue: one pass over the collected payments of the period ------------------------
        Map<String, AdminDashboardReport.RevenuePoint> series = new LinkedHashMap<>();
        for (String period : periods(start, end, g)) {
            series.put(period, AdminDashboardReport.RevenuePoint.builder()
                    .period(period).courseSales(BigDecimal.ZERO).aiSubscription(BigDecimal.ZERO).build());
        }
        BigDecimal courseSales = BigDecimal.ZERO;
        BigDecimal aiSubscription = BigDecimal.ZERO;
        Map<Long, BigDecimal> revenueByCourse = new HashMap<>();
        Map<Long, BigDecimal> revenueByPlan = new HashMap<>();
        Map<Long, String> paidCourseTitles = new HashMap<>();
        Map<Long, String> paidPlanTitles = new HashMap<>();
        for (Object[] row : payments.findPaidBetween(fromInstant, toInstant)) {
            Instant paidAt = (Instant) row[0];
            String type = (String) row[1];
            Long refId = (Long) row[2];
            BigDecimal amount = row[3] == null ? BigDecimal.ZERO : (BigDecimal) row[3];
            String title = (String) row[4];
            AdminDashboardReport.RevenuePoint point = series.get(periodKey(paidAt.atZone(ZONE).toLocalDate(), g));
            if (Payment.COURSE.equals(type)) {
                courseSales = courseSales.add(amount);
                if (point != null) {
                    point.setCourseSales(point.getCourseSales().add(amount));
                }
                if (refId != null) {
                    revenueByCourse.merge(refId, amount, BigDecimal::add);
                    if (title != null && !title.isBlank()) {
                        paidCourseTitles.putIfAbsent(refId, title);
                    }
                }
            } else if (Payment.SUBSCRIPTION.equals(type)) {
                aiSubscription = aiSubscription.add(amount);
                if (point != null) {
                    point.setAiSubscription(point.getAiSubscription().add(amount));
                }
                if (refId != null) {
                    revenueByPlan.merge(refId, amount, BigDecimal::add);
                    if (title != null && !title.isBlank()) {
                        paidPlanTitles.putIfAbsent(refId, title);
                    }
                }
            }
        }

        // ---- AI usage of the period -------------------------------------------------------------
        long tokensUsed = nullSafe(aiLogs.sumSettledTokensBetween(fromInstant, toInstant));
        long aiRequests = aiLogs.countSettledBetween(fromInstant, toInstant);
        long aiFailed = aiLogs.countFailedBetween(fromInstant, toInstant);
        List<AdminDashboardReport.AiUsageEntry> entries = aiLogs
                .findRecentSettledBetween(fromInstant, toInstant, PageRequest.of(0, AI_LOG_LIMIT))
                .stream()
                .map(this::toEntry)
                .toList();

        return AdminDashboardReport.builder()
                .summary(AdminDashboardReport.Summary.builder()
                        .netRevenue(courseSales.add(aiSubscription))
                        .users(AdminDashboardReport.Users.builder()
                                .total(users.count())
                                .students(users.countByRoleName(User.ROLE_STUDENT))
                                .courseManagers(users.countByRoleName(User.ROLE_COURSE_MANAGER))
                                .admins(users.countByRoleName(User.ROLE_ADMIN))
                                .build())
                        .courses(AdminDashboardReport.Courses.builder()
                                .active(courses.countByIsPublishedTrue())
                                .total(courses.count())
                                .build())
                        .ai(AdminDashboardReport.Ai.builder().tokensUsed(tokensUsed).build())
                        .build())
                .revenueSeries(new ArrayList<>(series.values()))
                .revenueBySource(AdminDashboardReport.RevenueBySource.builder()
                        .courseSales(courseSales)
                        .aiSubscription(aiSubscription)
                        .aiPlans(planRevenue(revenueByPlan, paidPlanTitles))
                        .topSellingCourses(topSellingCourses(revenueByCourse, paidCourseTitles))
                        .build())
                .topCourses(topCourses(sort))
                .aiLogs(entries)
                .aiLogTotals(AdminDashboardReport.AiLogTotals.builder()
                        .requests(aiRequests)
                        .failed(aiFailed)
                        .shown(entries.size())
                        .build())
                .dataStart(dataStart())
                .build();
    }

    // ---------------------------------------------------------------------------------------------
    // Pieces
    // ---------------------------------------------------------------------------------------------

    /** Revenue per plan of the period, biggest first; the plan's current name wins over the paid title. */
    private List<AdminDashboardReport.PlanRevenue> planRevenue(Map<Long, BigDecimal> byPlan,
                                                               Map<Long, String> paidTitles) {
        if (byPlan.isEmpty()) {
            return List.of();
        }
        Map<Long, String> names = new HashMap<>();
        for (SubscriptionPlan plan : plans.findAllById(byPlan.keySet())) {
            names.put(plan.getPlanId(),
                    plan.getPlanName() == null || plan.getPlanName().isBlank()
                            ? "Plan #" + plan.getPlanId()
                            : plan.getPlanName());
        }
        List<AdminDashboardReport.PlanRevenue> rows = new ArrayList<>();
        for (Map.Entry<Long, BigDecimal> entry : byPlan.entrySet()) {
            rows.add(AdminDashboardReport.PlanRevenue.builder()
                    .plan(names.getOrDefault(entry.getKey(),
                            paidTitles.getOrDefault(entry.getKey(), "Plan #" + entry.getKey())))
                    .revenue(entry.getValue())
                    .build());
        }
        rows.sort(Comparator.comparing(AdminDashboardReport.PlanRevenue::getRevenue).reversed()
                .thenComparing(AdminDashboardReport.PlanRevenue::getPlan));
        return rows;
    }

    /** Up to 3 best-selling courses of the period, biggest first. */
    private List<AdminDashboardReport.CourseRevenue> topSellingCourses(Map<Long, BigDecimal> byCourse,
                                                                       Map<Long, String> paidTitles) {
        List<Long> ids = topIdsByDecimal(byCourse, TOP_SELLING_COURSES);
        if (ids.isEmpty()) {
            return List.of();
        }
        Map<Long, String> names = courseTitles(ids);
        List<AdminDashboardReport.CourseRevenue> rows = new ArrayList<>();
        for (Long id : ids) {
            rows.add(AdminDashboardReport.CourseRevenue.builder()
                    .title(names.getOrDefault(id, paidTitles.getOrDefault(id, "Course #" + id)))
                    .revenue(byCourse.getOrDefault(id, BigDecimal.ZERO))
                    .build());
        }
        return rows;
    }

    /**
     * All-time top courses for the requested ranking: lifetime course revenue against the course's
     * live enrollments (cancelled rows are excluded from the count so it agrees with revenue).
     * The candidates are the top {@link #TOP_COURSES} of each metric, so the correct top 5 exists
     * whichever ranking the caller picked.
     */
    private List<AdminDashboardReport.TopCourse> topCourses(String sort) {
        Map<Long, BigDecimal> revenue = new HashMap<>();
        for (Object[] row : payments.sumCourseRevenueByCourse()) {
            revenue.put((Long) row[0], row[1] == null ? BigDecimal.ZERO : (BigDecimal) row[1]);
        }
        Map<Long, Long> enrollmentCounts = new HashMap<>();
        for (Object[] row : enrollments.countLiveByCourse()) {
            enrollmentCounts.put((Long) row[0], ((Number) row[1]).longValue());
        }
        Set<Long> candidates = new LinkedHashSet<>(topIdsByDecimal(revenue, TOP_COURSES));
        candidates.addAll(topIdsByLong(enrollmentCounts, TOP_COURSES));
        if (candidates.isEmpty()) {
            return List.of();
        }
        List<AdminDashboardReport.TopCourse> rows = new ArrayList<>();
        for (Course course : courses.findAllById(candidates)) {
            rows.add(AdminDashboardReport.TopCourse.builder()
                    .courseId(course.getCourseId())
                    .title(course.getTitle())
                    .revenue(revenue.getOrDefault(course.getCourseId(), BigDecimal.ZERO))
                    .enrollments(enrollmentCounts.getOrDefault(course.getCourseId(), 0L))
                    .status(Boolean.TRUE.equals(course.getIsPublished()) ? "PUBLISHED" : "DRAFT")
                    .build());
        }
        Comparator<AdminDashboardReport.TopCourse> byMetric = "enrollments".equals(sort)
                ? Comparator.comparingLong(AdminDashboardReport.TopCourse::getEnrollments).reversed()
                : Comparator.comparing(AdminDashboardReport.TopCourse::getRevenue).reversed();
        rows.sort(byMetric.thenComparing(AdminDashboardReport.TopCourse::getCourseId));
        return rows.size() > TOP_COURSES ? List.copyOf(rows.subList(0, TOP_COURSES)) : rows;
    }

    private Map<Long, String> courseTitles(List<Long> ids) {
        Map<Long, String> titles = new HashMap<>();
        for (Course course : courses.findAllById(ids)) {
            titles.put(course.getCourseId(), course.getTitle());
        }
        return titles;
    }

    private AdminDashboardReport.AiUsageEntry toEntry(AiUsageLog log) {
        long tokens = (long) nullSafe(log.getInputTokens()) + nullSafe(log.getOutputTokens());
        return AdminDashboardReport.AiUsageEntry.builder()
                .id(String.valueOf(log.getLogId()))
                .time(LOCAL_DATE_TIME.format(log.getCreatedAt().atZone(ZONE)))
                .user(log.getUser().getFullName())
                .feature(featureLabel(log.getPurpose()))
                .tokens(tokens)
                .success("SUCCESS".equals(log.getStatus()) || "PARTIAL".equals(log.getStatus()))
                .build();
    }

    /** First calendar day the platform has data; today when there is not a single account yet. */
    private String dataStart() {
        Instant first = users.findFirstCreatedAt();
        return (first == null ? LocalDate.now(ZONE) : first.atZone(ZONE).toLocalDate()).toString();
    }

    // ---------------------------------------------------------------------------------------------
    // Periods and helpers
    // ---------------------------------------------------------------------------------------------

    private static String normalize(String value, Set<String> allowed, String fallback, String message) {
        if (value == null || value.isBlank()) {
            return fallback;
        }
        String normalized = value.trim().toLowerCase();
        if (!allowed.contains(normalized)) {
            throw new BadRequestException(message);
        }
        return normalized;
    }

    /** Parses one end of the range in the granularity's own format into a calendar day. */
    private static LocalDate parsePeriod(String value, String granularity, boolean start) {
        if (value == null || value.isBlank()) {
            throw new BadRequestException("from and to are required");
        }
        String text = value.trim();
        try {
            return switch (granularity) {
                case "month" -> start ? YearMonth.parse(text).atDay(1) : YearMonth.parse(text).atEndOfMonth();
                case "year" -> {
                    int year = Integer.parseInt(text);
                    yield start ? LocalDate.of(year, 1, 1) : LocalDate.of(year, 12, 31);
                }
                default -> LocalDate.parse(text);
            };
        } catch (DateTimeException | NumberFormatException ex) {
            throw new BadRequestException("Invalid " + (start ? "from" : "to") + " for granularity " + granularity);
        }
    }

    /** Every period key of the filter, in order. */
    private static List<String> periods(LocalDate start, LocalDate end, String granularity) {
        List<String> keys = new ArrayList<>();
        switch (granularity) {
            case "month" -> {
                for (YearMonth month = YearMonth.from(start); !month.isAfter(YearMonth.from(end)); month = month.plusMonths(1)) {
                    keys.add(month.toString());
                }
            }
            case "year" -> {
                for (int year = start.getYear(); year <= end.getYear(); year++) {
                    keys.add(String.valueOf(year));
                }
            }
            default -> {
                for (LocalDate day = start; !day.isAfter(end); day = day.plusDays(1)) {
                    keys.add(day.toString());
                }
            }
        }
        return keys;
    }

    private static String periodKey(LocalDate day, String granularity) {
        return switch (granularity) {
            case "month" -> YearMonth.from(day).toString();
            case "year" -> String.valueOf(day.getYear());
            default -> day.toString();
        };
    }

    /** The ids holding the highest values, biggest first (ties by id) — at most {@code limit}. */
    private static List<Long> topIdsByDecimal(Map<Long, BigDecimal> values, int limit) {
        return values.entrySet().stream()
                .sorted(Map.Entry.<Long, BigDecimal>comparingByValue().reversed()
                        .thenComparing(Map.Entry.comparingByKey()))
                .limit(limit)
                .map(Map.Entry::getKey)
                .toList();
    }

    /** Same, for count maps. */
    private static List<Long> topIdsByLong(Map<Long, Long> values, int limit) {
        return values.entrySet().stream()
                .sorted(Map.Entry.<Long, Long>comparingByValue().reversed()
                        .thenComparing(Map.Entry.comparingByKey()))
                .limit(limit)
                .map(Map.Entry::getKey)
                .toList();
    }

    private static long nullSafe(Integer value) {
        return value == null ? 0L : value.longValue();
    }

    private static long nullSafe(Long value) {
        return value == null ? 0L : value;
    }

    private static String featureLabel(String purpose) {
        if (purpose == null || purpose.isBlank()) {
            return "AI request";
        }
        return FEATURE_LABELS.getOrDefault(purpose, purpose);
    }
}
