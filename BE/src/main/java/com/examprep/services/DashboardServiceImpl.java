package com.examprep.services;

import com.examprep.dto.*;
import com.examprep.entities.Enrollment;
import com.examprep.entities.User;
import com.examprep.repositories.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
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

    @Override
    @Transactional(readOnly = true)
    public StudentDashboardResponse getStudentDashboard(Long userId) {
        log.info("Building student dashboard for user ID: {}", userId);

        List<Object[]> enrollRows = enrollmentRepository.summarizeByUserId(userId);
        Object[] er = enrollRows.isEmpty() ? new Object[]{0L, 0L, 0L} : enrollRows.get(0);
        long enrolledCourses = er[0] == null ? 0L : ((Number) er[0]).longValue();
        long activeCourses = er[1] == null ? 0L : ((Number) er[1]).longValue();
        long completedCourses = er[2] == null ? 0L : ((Number) er[2]).longValue();

        List<Object[]> attemptRows = examAttemptRepository.summarizeByUserId(userId);
        Object[] ar = attemptRows.isEmpty() ? new Object[]{0L, null} : attemptRows.get(0);
        long totalAttempts = ar[0] == null ? 0L : ((Number) ar[0]).longValue();
        double averageScore = ar[1] == null ? 0.0 : ((Number) ar[1]).doubleValue();

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
