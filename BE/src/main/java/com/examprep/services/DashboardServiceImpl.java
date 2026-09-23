package com.examprep.services;

import com.examprep.dto.*;
import com.examprep.entities.Enrollment;
import com.examprep.entities.Role;
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

        long enrolledCourses = enrollmentRepository.countByUserId(userId);
        long activeCourses = enrollmentRepository.countByUserIdAndStatus(userId, Enrollment.STATUS_ACTIVE);
        long completedCourses = enrollmentRepository.countByUserIdAndStatus(userId, Enrollment.STATUS_COMPLETED);
        long totalAttempts = examAttemptRepository.countByUserId(userId);
        Number average = examAttemptRepository.averageScoreByUserId(userId);
        double averageScore = average == null ? 0.0 : average.doubleValue();

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
        long totalStudents = userRepository.countByRoleCode(Role.CODE_STUDENT);
        long totalManagers = userRepository.countByRoleCode(Role.CODE_COURSE_MANAGER);
        long totalCourses = courseRepository.count();
        long totalExams = examRepository.count();

        List<RecentUser> recentUsers = userRepository.findRecentUsers(PageRequest.of(0, RECENT_LIMIT));

        return AdminDashboardResponse.builder()
                .summary(AdminDashboardResponse.Summary.builder()
                        .totalUsers(totalUsers)
                        .totalStudents(totalStudents)
                        .totalManagers(totalManagers)
                        .totalCourses(totalCourses)
                        .totalExams(totalExams)
                        .build())
                .recentUsers(recentUsers)
                .build();
    }
}
