package com.examprep.services;

import com.examprep.dto.CmAttemptFact;
import com.examprep.dto.CourseManagerDashboardDtos;
import com.examprep.entities.Course;
import com.examprep.entities.Enrollment;
import com.examprep.exceptions.BadRequestException;
import com.examprep.repositories.CourseRepository;
import com.examprep.repositories.EnrollmentRepository;
import com.examprep.repositories.ExamRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * DASH-05. Scoped to the courses the caller manages (owner or co-manager) and the course exams the
 * caller created in them. Scores are percentages of each attempt's own frozen max score, so an exam
 * edited later cannot restate an old attempt.
 */
@Service
@RequiredArgsConstructor
public class CourseManagerDashboardServiceImpl implements CourseManagerDashboardService {

    /** Attempts below this many submissions rank last and fade in the UI. */
    static final int DEFAULT_MIN_ATTEMPTS = 5;

    private static final BigDecimal HUNDRED = BigDecimal.valueOf(100);
    private static final BigDecimal PASS_THRESHOLD = BigDecimal.valueOf(CourseManagerDashboardDtos.PASS_THRESHOLD_PERCENT);
    private static final Set<String> PENDING_GRADING = Set.of("SUBMITTED", "GRADING");
    private static final String GRADED = "COMPLETED";
    private static final Comparator<BigDecimal> NULLS_LAST = Comparator.nullsLast(Comparator.naturalOrder());

    private final CourseRepository courses;
    private final ExamRepository exams;
    private final EnrollmentRepository enrollments;
    private final ObjectMapper json;

    @Override
    @Transactional(readOnly = true)
    public CourseManagerDashboardDtos.Summary summary(Long userId) {
        Scope scope = loadScope(userId);
        if (scope.courseIds().isEmpty()) {
            return emptySummary();
        }
        Aggregate all = aggregate(scope.facts());
        Instant weekAgo = Instant.now().minus(7, ChronoUnit.DAYS);
        long submitted7d = scope.facts().stream()
                .filter(fact -> fact.submittedAt() != null && fact.submittedAt().isAfter(weekAgo))
                .count();
        return CourseManagerDashboardDtos.Summary.builder()
                .managedCourses(scope.courseIds().size())
                .activeStudents(enrollments.countDistinctStudentsByManagerIdAndStatus(
                        userId, Enrollment.STATUS_ACTIVE))
                .myExams(myExams(scope))
                .submittedAttempts7d(submitted7d)
                .avgScore(all.avgScore())
                .passRate(all.passRate())
                .pendingGrading(all.pending())
                .build();
    }

    @Override
    @Transactional(readOnly = true)
    public List<CourseManagerDashboardDtos.CourseStat> courses(Long userId) {
        Scope scope = loadScope(userId);
        if (scope.courseIds().isEmpty()) {
            return List.of();
        }
        Map<Long, Long> activeStudents = pairsToLong(
                enrollments.countDistinctStudentsByCourseIds(scope.courseIds(), Enrollment.STATUS_ACTIVE));
        Map<Long, Long> examCounts = new HashMap<>();
        for (ExamInfo exam : scope.exams().values()) {
            if (exam.courseId() != null) {
                examCounts.merge(exam.courseId(), 1L, Long::sum);
            }
        }
        Map<Long, Aggregate> byCourse = new HashMap<>();
        for (CmAttemptFact fact : scope.facts()) {
            if (fact.courseId() != null) {
                byCourse.computeIfAbsent(fact.courseId(), key -> new Aggregate()).add(fact, json);
            }
        }
        Map<Long, String> titles = new HashMap<>();
        for (Course course : courses.findAllById(scope.courseIds())) {
            titles.put(course.getCourseId(), course.getTitle());
        }

        List<CourseManagerDashboardDtos.CourseStat> rows = new ArrayList<>();
        for (Long courseId : scope.courseIds()) {
            Aggregate aggregate = byCourse.getOrDefault(courseId, new Aggregate());
            rows.add(CourseManagerDashboardDtos.CourseStat.builder()
                    .courseId(courseId)
                    .title(titles.getOrDefault(courseId, "Course #" + courseId))
                    .activeStudents(activeStudents.getOrDefault(courseId, 0L))
                    .myExamCount(examCounts.getOrDefault(courseId, 0L))
                    .submittedAttempts(aggregate.submitted())
                    .avgScore(aggregate.avgScore())
                    .passRate(aggregate.passRate())
                    .build());
        }
        // Lowest pass rate first, no-data last — the panel's documented order.
        rows.sort(Comparator.comparing(CourseManagerDashboardDtos.CourseStat::getPassRate, NULLS_LAST)
                .thenComparing(CourseManagerDashboardDtos.CourseStat::getTitle, String.CASE_INSENSITIVE_ORDER));
        return rows;
    }

    @Override
    @Transactional(readOnly = true)
    public List<CourseManagerDashboardDtos.ExamStat> exams(Long userId, Long courseId, Integer minAttempts) {
        int threshold = normalizeMinAttempts(minAttempts);
        Scope scope = loadScope(userId);
        Map<Long, Aggregate> byExam = new HashMap<>();
        for (CmAttemptFact fact : scope.facts()) {
            if (fact.examId() != null) {
                byExam.computeIfAbsent(fact.examId(), key -> new Aggregate()).add(fact, json);
            }
        }

        List<CourseManagerDashboardDtos.ExamStat> rows = new ArrayList<>();
        for (ExamInfo exam : scope.exams().values()) {
            if (courseId != null && !courseId.equals(exam.courseId())) {
                continue;
            }
            Aggregate aggregate = byExam.getOrDefault(exam.examId(), new Aggregate());
            rows.add(CourseManagerDashboardDtos.ExamStat.builder()
                    .examId(exam.examId())
                    .title(exam.title())
                    .courseId(exam.courseId())
                    .courseTitle(exam.courseTitle())
                    .status(exam.status())
                    .submittedAttempts(aggregate.submitted())
                    .avgScore(aggregate.avgScore())
                    .passRate(aggregate.passRate())
                    .avgDurationMinutes(aggregate.avgDurationMinutes())
                    .pendingGrading(aggregate.pending())
                    .build());
        }
        // Lowest pass rate first; exams under `minAttempts` submissions (or with no pass rate) last.
        Comparator<CourseManagerDashboardDtos.ExamStat> thinData =
                Comparator.comparingInt(exam -> exam.getSubmittedAttempts() < threshold || exam.getPassRate() == null ? 1 : 0);
        rows.sort(thinData
                .thenComparing(CourseManagerDashboardDtos.ExamStat::getPassRate, NULLS_LAST)
                .thenComparing(Comparator.comparingLong(CourseManagerDashboardDtos.ExamStat::getSubmittedAttempts).reversed()));
        return rows;
    }

    // ---------------------------------------------------------------------------------------------
    // Scope
    // ---------------------------------------------------------------------------------------------

    private record ExamInfo(Long examId, String title, String status, Long courseId, String courseTitle) {
    }

    private record Scope(List<Long> courseIds, LinkedHashMap<Long, ExamInfo> exams, List<CmAttemptFact> facts) {
    }

    private Scope loadScope(Long userId) {
        List<Long> courseIds = courses.findCourseIdsManagedByUser(userId);
        if (courseIds.isEmpty()) {
            return new Scope(List.of(), new LinkedHashMap<>(), List.of());
        }
        LinkedHashMap<Long, ExamInfo> byId = new LinkedHashMap<>();
        for (Object[] row : exams.findMyCourseExamsForDashboard(userId, courseIds)) {
            ExamInfo info = new ExamInfo((Long) row[0], (String) row[1], (String) row[2], (Long) row[3], (String) row[4]);
            byId.put(info.examId(), info);
        }
        List<CmAttemptFact> facts = byId.isEmpty()
                ? List.of()
                : exams.findAttemptFactsForManager(userId, courseIds);
        return new Scope(courseIds, byId, facts);
    }

    private static CourseManagerDashboardDtos.Summary emptySummary() {
        return CourseManagerDashboardDtos.Summary.builder()
                .managedCourses(0)
                .activeStudents(0)
                .myExams(CourseManagerDashboardDtos.MyExams.builder().build())
                .submittedAttempts7d(0)
                .pendingGrading(0)
                .build();
    }

    private static CourseManagerDashboardDtos.MyExams myExams(Scope scope) {
        long published = 0;
        long draft = 0;
        long archived = 0;
        for (ExamInfo exam : scope.exams().values()) {
            switch (exam.status() == null ? "" : exam.status()) {
                case "PUBLISHED" -> published++;
                case "DRAFT" -> draft++;
                case "ARCHIVED" -> archived++;
                default -> {
                    // Any other status is counted in the total only.
                }
            }
        }
        return CourseManagerDashboardDtos.MyExams.builder()
                .total(scope.exams().size())
                .published(published)
                .draft(draft)
                .archived(archived)
                .build();
    }

    private Aggregate aggregate(List<CmAttemptFact> facts) {
        Aggregate aggregate = new Aggregate();
        facts.forEach(fact -> aggregate.add(fact, json));
        return aggregate;
    }

    private static int normalizeMinAttempts(Integer minAttempts) {
        if (minAttempts == null) {
            return DEFAULT_MIN_ATTEMPTS;
        }
        if (minAttempts < 1 || minAttempts > 100) {
            throw new BadRequestException("minAttempts must be between 1 and 100");
        }
        return minAttempts;
    }

    private static Map<Long, Long> pairsToLong(List<Object[]> rows) {
        Map<Long, Long> map = new HashMap<>();
        for (Object[] row : rows) {
            map.put((Long) row[0], ((Number) row[1]).longValue());
        }
        return map;
    }

    // ---------------------------------------------------------------------------------------------
    // Aggregation
    // ---------------------------------------------------------------------------------------------

    /** Running totals of one exam or course: submitted attempts, pending grading, scores, duration. */
    private static final class Aggregate {
        private long submitted;
        private long pending;
        private long graded;
        private long passed;
        private long durationSeconds;
        private long durationCount;
        private BigDecimal percentSum = BigDecimal.ZERO;

        void add(CmAttemptFact fact, ObjectMapper json) {
            submitted++;
            if (PENDING_GRADING.contains(fact.status())) {
                pending++;
            }
            if (GRADED.equals(fact.status())) {
                BigDecimal percent = attemptPercent(fact, json);
                if (percent != null) {
                    graded++;
                    percentSum = percentSum.add(percent);
                    if (percent.compareTo(PASS_THRESHOLD) >= 0) {
                        passed++;
                    }
                }
            }
            if (fact.submittedAt() != null && fact.startTime() != null
                    && !fact.submittedAt().isBefore(fact.startTime())) {
                durationSeconds += Duration.between(fact.startTime(), fact.submittedAt()).toSeconds();
                durationCount++;
            }
        }

        long submitted() {
            return submitted;
        }

        long pending() {
            return pending;
        }

        /** Average percentage (0-100, one decimal); null when nothing is graded yet. */
        BigDecimal avgScore() {
            return graded == 0
                    ? null
                    : percentSum.divide(BigDecimal.valueOf(graded), 1, RoundingMode.HALF_UP);
        }

        /** Share of graded attempts at or above the pass threshold (0-100, one decimal). */
        BigDecimal passRate() {
            return graded == 0
                    ? null
                    : BigDecimal.valueOf(passed).multiply(HUNDRED)
                            .divide(BigDecimal.valueOf(graded), 1, RoundingMode.HALF_UP);
        }

        /** Average start-to-submit minutes, rounded to the minute; null without submissions. */
        Integer avgDurationMinutes() {
            return durationCount == 0
                    ? null
                    : (int) Math.round((double) durationSeconds / durationCount / 60.0);
        }
    }

    /** The attempt's score as a percentage of its frozen max score, clamped to 0..100. */
    private static BigDecimal attemptPercent(CmAttemptFact fact, ObjectMapper json) {
        if (fact.totalScore() == null) {
            return null;
        }
        BigDecimal maxScore = maxScore(fact, json);
        if (maxScore == null || maxScore.signum() <= 0) {
            return null;
        }
        BigDecimal percent = fact.totalScore().multiply(HUNDRED).divide(maxScore, 1, RoundingMode.HALF_UP);
        if (percent.signum() < 0) {
            return BigDecimal.ZERO;
        }
        return percent.compareTo(HUNDRED) > 0 ? HUNDRED : percent;
    }

    /** The attempt's own max score: the frozen {@code exam_snapshot}, else the live exam value. */
    private static BigDecimal maxScore(CmAttemptFact fact, ObjectMapper json) {
        String snapshot = fact.examSnapshot();
        if (snapshot != null && !snapshot.isBlank()) {
            try {
                JsonNode node = json.readTree(snapshot).path("maxScore");
                if (node.isNumber()) {
                    return node.decimalValue();
                }
            } catch (Exception ignored) {
                // Unreadable snapshot → fall back to the live exam value below.
            }
        }
        return fact.examMaxScore();
    }
}
