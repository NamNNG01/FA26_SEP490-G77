package com.examprep.services;

import com.examprep.dto.*;
import com.examprep.entities.User;
import com.examprep.repositories.*;
import com.examprep.util.ShortTtlCache;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class DashboardServiceImpl implements DashboardService {

    private static final int RECENT_LIMIT = 5;

    private final EnrollmentRepository enrollmentRepository;
    private final CourseRepository courseRepository;
    private final ExamAttemptRepository examAttemptRepository;
    private final ExamRepository examRepository;
    private final UserRepository userRepository;

    @Value("${app.read-cache.ttl-ms:5000}")
    private long cacheTtlMs = 5000L;
    private volatile ShortTtlCache<Long, StudentDashboardResponse> studentCache;

    private ShortTtlCache<Long, StudentDashboardResponse> cache() {
        if (studentCache == null) {
            studentCache = new ShortTtlCache<>(cacheTtlMs, 512);
        }
        return studentCache;
    }

    @Override
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    public StudentDashboardResponse getStudentDashboard(Long userId) {
        return cache().getOrCompute(userId, () -> loadStudentDashboard(userId));
    }

    private StudentDashboardResponse loadStudentDashboard(Long userId) {
        log.debug("Building student dashboard for user ID: {}", userId);

        Object[] enrollSummary = unwrapRow(enrollmentRepository.summarizeByUserId(userId));
        long enrolledCourses = toLong(enrollSummary, 0);
        long activeCourses = toLong(enrollSummary, 1);
        long completedCourses = toLong(enrollSummary, 2);

        Object[] attemptSummary = unwrapRow(examAttemptRepository.summarizeByUserId(userId));
        long totalAttempts = toLong(attemptSummary, 0);
        double averageScore = attemptSummary != null && attemptSummary.length > 1 && attemptSummary[1] != null
                ? ((Number) attemptSummary[1]).doubleValue() : 0.0;

        List<StudentRecentCourse> recentCourses =
                enrollmentRepository.findRecentCoursesByUserId(userId, PageRequest.of(0, RECENT_LIMIT));
        List<StudentRecentAttempt> recentAttempts =
                examAttemptRepository.findRecentAttemptsByUserId(userId, PageRequest.of(0, RECENT_LIMIT));

        return StudentDashboardResponse.builder()
                .summary(StudentDashboardResponse.Summary.builder()
                        .enrolledCourses(enrolledCourses)
                        .activeCourses(activeCourses)
                        .completedCourses(completedCourses)
                        .totalAttempts(totalAttempts)
                        .averageScore(averageScore)
                        .build())
                .recentCourses(recentCourses)
                .recentAttempts(recentAttempts)
                .build();
    }

    private static Object[] unwrapRow(Object[] row) {
        if (row != null && row.length == 1 && row[0] instanceof Object[] nested) {
            return nested;
        }
        return row;
    }

    private static long toLong(Object[] row, int idx) {
        if (row == null || idx >= row.length || row[idx] == null) {
            return 0L;
        }
        return ((Number) row[idx]).longValue();
    }

    @Override
    @Transactional(readOnly = true)
    public CourseManagerDashboardResponse getCourseManagerDashboard(Long userId) {
        log.info("Building course manager dashboard for user ID: {}", userId);

        long totalCourses = courseRepository.countByManagerId(userId);
        long publishedCourses = courseRepository.countByManagerIdAndPublished(userId, true);
        long draftCourses = courseRepository.countByManagerIdAndPublished(userId, false);
        long totalStudents = enrollmentRepository.countDistinctStudentsByManagerId(userId);

        List<CourseManagerDashboardResponse.RecentCourse> recentCourses =
                courseRepository.findRecentCoursesByManagerId(userId, PageRequest.of(0, RECENT_LIMIT))
                        .stream()
                        .map(info -> CourseManagerDashboardResponse.RecentCourse.builder()
                                .courseId(info.getCourseId())
                                .title(info.getTitle())
                                .status(Boolean.TRUE.equals(info.getIsPublished()) ? "PUBLISHED" : "DRAFT")
                                .studentCount(info.getStudentCount())
                                .build())
                        .collect(Collectors.toList());

        return CourseManagerDashboardResponse.builder()
                .summary(CourseManagerDashboardResponse.Summary.builder()
                        .totalCourses(totalCourses)
                        .publishedCourses(publishedCourses)
                        .draftCourses(draftCourses)
                        .totalStudents(totalStudents)
                        .build())
                .recentCourses(recentCourses)
                .build();
    }

    @Override
    @Transactional(readOnly = true)
    public AdminDashboardResponse getAdminDashboard() {
        log.info("Building admin dashboard");

        long totalUsers = userRepository.count();
        long totalStudents = userRepository.countByRoleName(User.ROLE_STUDENT);
        long totalManagers = userRepository.countByRoleName(User.ROLE_COURSE_MANAGER);

        long totalCourses = courseRepository.count();
        long publishedCourses = courseRepository.countByIsPublishedTrue();
        long draftCourses = courseRepository.countByIsPublishedFalse();

        long totalExams = examRepository.count();

        List<RecentUser> recentUsers =
                userRepository.findRecentUsers(PageRequest.of(0, RECENT_LIMIT));

        return AdminDashboardResponse.builder()
                .summary(AdminDashboardResponse.Summary.builder()
                        .totalUsers(totalUsers)
                        .totalStudents(totalStudents)
                        .totalManagers(totalManagers)
                        .totalCourses(totalCourses)
                        .publishedCourses(publishedCourses)
                        .draftCourses(draftCourses)
                        .totalExams(totalExams)
                        .build())
                .recentUsers(recentUsers)
                .build();
    }
}
