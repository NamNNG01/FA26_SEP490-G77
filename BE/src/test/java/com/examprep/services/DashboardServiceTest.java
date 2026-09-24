package com.examprep.services;

import com.examprep.dto.*;
import com.examprep.entities.Enrollment;
import com.examprep.entities.Role;
import com.examprep.repositories.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Pageable;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class DashboardServiceTest {

    private static final Long STUDENT_ID = 101L;
    private static final Long MANAGER_ID = 201L;

    @Mock
    private EnrollmentRepository enrollmentRepository;

    @Mock
    private CourseRepository courseRepository;

    @Mock
    private ExamAttemptRepository examAttemptRepository;

    @Mock
    private ExamRepository examRepository;

    @Mock
    private UserRepository userRepository;

    @InjectMocks
    private DashboardServiceImpl dashboardService;

    @Test
    void getStudentDashboard_Success() {
        when(enrollmentRepository.countByUserId(STUDENT_ID)).thenReturn(5L);
        when(enrollmentRepository.countByUserIdAndStatus(STUDENT_ID, Enrollment.STATUS_ACTIVE)).thenReturn(3L);
        when(enrollmentRepository.countByUserIdAndStatus(STUDENT_ID, Enrollment.STATUS_COMPLETED)).thenReturn(2L);
        when(examAttemptRepository.countByUserId(STUDENT_ID)).thenReturn(18L);
        when(examAttemptRepository.averageScoreByUserId(STUDENT_ID)).thenReturn(new BigDecimal("78.5"));

        StudentRecentCourse recentCourse = StudentRecentCourse.builder()
                .courseId(12L)
                .title("IELTS Academic")
                .thumbnailUrl("https://cdn.example.com/thumb.jpg")
                .progress(65)
                .build();
        StudentRecentAttempt recentAttempt = StudentRecentAttempt.builder()
                .attemptId(301L)
                .examId(20L)
                .examTitle("IELTS Reading Mock Test 01")
                .score(new BigDecimal("82.5"))
                .status("GRADED")
                .submittedAt(Instant.parse("2026-09-19T14:20:00Z"))
                .build();

        when(enrollmentRepository.findRecentCoursesByUserId(eq(STUDENT_ID), any(Pageable.class)))
                .thenReturn(List.of(recentCourse));
        when(examAttemptRepository.findRecentAttemptsByUserId(eq(STUDENT_ID), any(Pageable.class)))
                .thenReturn(List.of(recentAttempt));

        StudentDashboardResponse response = dashboardService.getStudentDashboard(STUDENT_ID);

        assertNotNull(response);
        assertNotNull(response.getSummary());
        assertEquals(5L, response.getSummary().getEnrolledCourses());
        assertEquals(3L, response.getSummary().getActiveCourses());
        assertEquals(2L, response.getSummary().getCompletedCourses());
        assertEquals(18L, response.getSummary().getTotalAttempts());
        assertEquals(78.5, response.getSummary().getAverageScore());

        assertEquals(1, response.getRecentCourses().size());
        assertEquals(12L, response.getRecentCourses().get(0).getCourseId());
        assertEquals("IELTS Academic", response.getRecentCourses().get(0).getTitle());
        assertEquals(65, response.getRecentCourses().get(0).getProgress());

        assertEquals(1, response.getRecentAttempts().size());
        assertEquals(301L, response.getRecentAttempts().get(0).getAttemptId());
        assertEquals(20L, response.getRecentAttempts().get(0).getExamId());
        assertEquals("IELTS Reading Mock Test 01", response.getRecentAttempts().get(0).getExamTitle());
        assertEquals("GRADED", response.getRecentAttempts().get(0).getStatus());
        assertEquals(0, new BigDecimal("82.5")
                .compareTo(response.getRecentAttempts().get(0).getScore()));
    }

    @Test
    void getStudentDashboard_NoData_ReturnsZeroSummaryAndEmptyLists() {
        when(enrollmentRepository.countByUserId(STUDENT_ID)).thenReturn(0L);
        when(enrollmentRepository.countByUserIdAndStatus(STUDENT_ID, Enrollment.STATUS_ACTIVE)).thenReturn(0L);
        when(enrollmentRepository.countByUserIdAndStatus(STUDENT_ID, Enrollment.STATUS_COMPLETED)).thenReturn(0L);
        when(examAttemptRepository.countByUserId(STUDENT_ID)).thenReturn(0L);
        when(examAttemptRepository.averageScoreByUserId(STUDENT_ID)).thenReturn(null);
        when(enrollmentRepository.findRecentCoursesByUserId(eq(STUDENT_ID), any(Pageable.class)))
                .thenReturn(List.of());
        when(examAttemptRepository.findRecentAttemptsByUserId(eq(STUDENT_ID), any(Pageable.class)))
                .thenReturn(List.of());

        StudentDashboardResponse response = dashboardService.getStudentDashboard(STUDENT_ID);

        assertEquals(0L, response.getSummary().getEnrolledCourses());
        assertEquals(0L, response.getSummary().getActiveCourses());
        assertEquals(0L, response.getSummary().getCompletedCourses());
        assertEquals(0L, response.getSummary().getTotalAttempts());
        assertEquals(0.0, response.getSummary().getAverageScore());
        assertTrue(response.getRecentCourses().isEmpty());
        assertTrue(response.getRecentAttempts().isEmpty());
    }

    @Test
    void getCourseManagerDashboard_Success() {
        when(courseRepository.countByManagerId(MANAGER_ID)).thenReturn(12L);
        when(courseRepository.countByManagerIdAndPublished(MANAGER_ID, true)).thenReturn(8L);
        when(courseRepository.countByManagerIdAndPublished(MANAGER_ID, false)).thenReturn(4L);
        when(enrollmentRepository.countDistinctStudentsByManagerId(MANAGER_ID)).thenReturn(1250L);

        ManagerCourseInfo published = ManagerCourseInfo.builder()
                .courseId(12L)
                .title("IELTS Academic")
                .isPublished(true)
                .studentCount(320L)
                .build();
        ManagerCourseInfo draft = ManagerCourseInfo.builder()
                .courseId(13L)
                .title("TOEFL Practice")
                .isPublished(false)
                .studentCount(0L)
                .build();
        when(courseRepository.findRecentCoursesByManagerId(eq(MANAGER_ID), any(Pageable.class)))
                .thenReturn(List.of(published, draft));

        CourseManagerDashboardResponse response = dashboardService.getCourseManagerDashboard(MANAGER_ID);

        assertNotNull(response);
        assertEquals(12L, response.getSummary().getTotalCourses());
        assertEquals(8L, response.getSummary().getPublishedCourses());
        assertEquals(4L, response.getSummary().getDraftCourses());
        assertEquals(1250L, response.getSummary().getTotalStudents());

        assertEquals(2, response.getRecentCourses().size());
        assertEquals(12L, response.getRecentCourses().get(0).getCourseId());
        assertEquals("IELTS Academic", response.getRecentCourses().get(0).getTitle());
        assertEquals("PUBLISHED", response.getRecentCourses().get(0).getStatus());
        assertEquals(320L, response.getRecentCourses().get(0).getStudentCount());
        assertEquals("DRAFT", response.getRecentCourses().get(1).getStatus());
        assertEquals(0L, response.getRecentCourses().get(1).getStudentCount());
    }

    @Test
    void getCourseManagerDashboard_Empty_ReturnsZeroSummaryAndEmptyList() {
        when(courseRepository.countByManagerId(MANAGER_ID)).thenReturn(0L);
        when(courseRepository.countByManagerIdAndPublished(MANAGER_ID, true)).thenReturn(0L);
        when(courseRepository.countByManagerIdAndPublished(MANAGER_ID, false)).thenReturn(0L);
        when(enrollmentRepository.countDistinctStudentsByManagerId(MANAGER_ID)).thenReturn(0L);
        when(courseRepository.findRecentCoursesByManagerId(eq(MANAGER_ID), any(Pageable.class)))
                .thenReturn(List.of());

        CourseManagerDashboardResponse response = dashboardService.getCourseManagerDashboard(MANAGER_ID);

        assertEquals(0L, response.getSummary().getTotalCourses());
        assertEquals(0L, response.getSummary().getPublishedCourses());
        assertEquals(0L, response.getSummary().getDraftCourses());
        assertEquals(0L, response.getSummary().getTotalStudents());
        assertTrue(response.getRecentCourses().isEmpty());
    }

    @Test
    void getAdminDashboard_Success() {
        when(userRepository.count()).thenReturn(2450L);
        when(userRepository.countByRoleCode(Role.CODE_STUDENT)).thenReturn(2200L);
        when(userRepository.countByRoleCode(Role.CODE_COURSE_MANAGER)).thenReturn(15L);
        when(courseRepository.count()).thenReturn(120L);
        when(examRepository.count()).thenReturn(350L);

        RecentUser recentUser = RecentUser.builder()
                .userId(1201L)
                .fullName("Nguyen Van A")
                .email("student@gmail.com")
                .role("STUDENT")
                .createdAt(Instant.parse("2026-09-20T09:20:00Z"))
                .build();
        when(userRepository.findRecentUsers(any(Pageable.class))).thenReturn(List.of(recentUser));

        AdminDashboardResponse response = dashboardService.getAdminDashboard();

        assertNotNull(response);
        assertEquals(2450L, response.getSummary().getTotalUsers());
        assertEquals(2200L, response.getSummary().getTotalStudents());
        assertEquals(15L, response.getSummary().getTotalManagers());
        assertEquals(120L, response.getSummary().getTotalCourses());
        assertEquals(350L, response.getSummary().getTotalExams());

        assertEquals(1, response.getRecentUsers().size());
        assertEquals(1201L, response.getRecentUsers().get(0).getUserId());
        assertEquals("Nguyen Van A", response.getRecentUsers().get(0).getFullName());
        assertEquals("student@gmail.com", response.getRecentUsers().get(0).getEmail());
        assertEquals("STUDENT", response.getRecentUsers().get(0).getRole());
        assertEquals(Instant.parse("2026-09-20T09:20:00Z"), response.getRecentUsers().get(0).getCreatedAt());
    }

    @Test
    void getAdminDashboard_Empty_ReturnsZeroSummaryAndEmptyList() {
        when(userRepository.count()).thenReturn(0L);
        when(userRepository.countByRoleCode(Role.CODE_STUDENT)).thenReturn(0L);
        when(userRepository.countByRoleCode(Role.CODE_COURSE_MANAGER)).thenReturn(0L);
        when(courseRepository.count()).thenReturn(0L);
        when(examRepository.count()).thenReturn(0L);
        when(userRepository.findRecentUsers(any(Pageable.class))).thenReturn(List.of());

        AdminDashboardResponse response = dashboardService.getAdminDashboard();

        assertEquals(0L, response.getSummary().getTotalUsers());
        assertEquals(0L, response.getSummary().getTotalStudents());
        assertEquals(0L, response.getSummary().getTotalManagers());
        assertEquals(0L, response.getSummary().getTotalCourses());
        assertEquals(0L, response.getSummary().getTotalExams());
        assertTrue(response.getRecentUsers().isEmpty());
    }
}
