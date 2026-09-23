package com.examprep.controllers;

import com.examprep.config.SecurityConfig;
import com.examprep.dto.*;
import com.examprep.security.JwtTokenProvider;
import com.examprep.security.RestAccessDeniedHandler;
import com.examprep.security.RestAuthenticationEntryPoint;
import com.examprep.security.UserPrincipal;
import com.examprep.services.DashboardService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(DashboardController.class)
@Import({SecurityConfig.class, RestAuthenticationEntryPoint.class, RestAccessDeniedHandler.class})
class DashboardControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @MockBean
    private DashboardService dashboardService;

    @MockBean
    private JwtTokenProvider jwtTokenProvider;

    @Test
    void studentDashboard_Success() throws Exception {
        StudentDashboardResponse body = StudentDashboardResponse.builder()
                .summary(StudentDashboardResponse.Summary.builder()
                        .enrolledCourses(5)
                        .activeCourses(3)
                        .completedCourses(2)
                        .totalAttempts(18)
                        .averageScore(78.5)
                        .build())
                .recentCourses(List.of(StudentRecentCourse.builder()
                        .courseId(12L)
                        .title("IELTS Academic")
                        .thumbnailUrl("https://cdn.example.com/thumb.jpg")
                        .progress(65)
                        .build()))
                .recentAttempts(List.of(StudentRecentAttempt.builder()
                        .attemptId(301L)
                        .examId(20L)
                        .examTitle("IELTS Reading Mock Test 01")
                        .score(new BigDecimal("82.5"))
                        .status("GRADED")
                        .submittedAt(Instant.parse("2026-09-19T14:20:00Z"))
                        .build()))
                .build();

        UserPrincipal principal = UserPrincipal.create(101L, "student@gmail.com", "STUDENT");
        when(dashboardService.getStudentDashboard(101L)).thenReturn(body);

        mockMvc.perform(get("/api/v1/dashboard/student").with(user(principal)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.message").doesNotExist())
                .andExpect(jsonPath("$.data.summary.enrolledCourses").value(5))
                .andExpect(jsonPath("$.data.summary.activeCourses").value(3))
                .andExpect(jsonPath("$.data.summary.completedCourses").value(2))
                .andExpect(jsonPath("$.data.summary.totalAttempts").value(18))
                .andExpect(jsonPath("$.data.summary.averageScore").value(78.5))
                .andExpect(jsonPath("$.data.recentCourses[0].courseId").value(12))
                .andExpect(jsonPath("$.data.recentCourses[0].title").value("IELTS Academic"))
                .andExpect(jsonPath("$.data.recentCourses[0].thumbnailUrl")
                        .value("https://cdn.example.com/thumb.jpg"))
                .andExpect(jsonPath("$.data.recentCourses[0].progress").value(65))
                .andExpect(jsonPath("$.data.recentAttempts[0].attemptId").value(301))
                .andExpect(jsonPath("$.data.recentAttempts[0].examId").value(20))
                .andExpect(jsonPath("$.data.recentAttempts[0].examTitle")
                        .value("IELTS Reading Mock Test 01"))
                .andExpect(jsonPath("$.data.recentAttempts[0].score").value(82.5))
                .andExpect(jsonPath("$.data.recentAttempts[0].status").value("GRADED"))
                .andExpect(jsonPath("$.data.recentAttempts[0].submittedAt")
                        .value("2026-09-19T14:20:00Z"));

        verify(dashboardService).getStudentDashboard(101L);
    }

    @Test
    void courseManagerDashboard_Success() throws Exception {
        CourseManagerDashboardResponse body = CourseManagerDashboardResponse.builder()
                .summary(CourseManagerDashboardResponse.Summary.builder()
                        .totalCourses(12)
                        .publishedCourses(8)
                        .draftCourses(4)
                        .totalStudents(1250)
                        .build())
                .recentCourses(List.of(CourseManagerDashboardResponse.RecentCourse.builder()
                        .courseId(12L)
                        .title("IELTS Academic")
                        .status("PUBLISHED")
                        .studentCount(320L)
                        .build()))
                .build();

        UserPrincipal principal = UserPrincipal.create(201L, "manager@gmail.com", "COURSE_MANAGER");
        when(dashboardService.getCourseManagerDashboard(201L)).thenReturn(body);

        mockMvc.perform(get("/api/v1/dashboard/course-manager").with(user(principal)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.message").doesNotExist())
                .andExpect(jsonPath("$.data.summary.totalCourses").value(12))
                .andExpect(jsonPath("$.data.summary.publishedCourses").value(8))
                .andExpect(jsonPath("$.data.summary.draftCourses").value(4))
                .andExpect(jsonPath("$.data.summary.totalStudents").value(1250))
                .andExpect(jsonPath("$.data.recentCourses[0].courseId").value(12))
                .andExpect(jsonPath("$.data.recentCourses[0].title").value("IELTS Academic"))
                .andExpect(jsonPath("$.data.recentCourses[0].status").value("PUBLISHED"))
                .andExpect(jsonPath("$.data.recentCourses[0].studentCount").value(320));

        verify(dashboardService).getCourseManagerDashboard(201L);
    }

    @Test
    void adminDashboard_Success() throws Exception {
        AdminDashboardResponse body = AdminDashboardResponse.builder()
                .summary(AdminDashboardResponse.Summary.builder()
                        .totalUsers(2450)
                        .totalStudents(2200)
                        .totalManagers(15)
                        .totalCourses(120)
                        .totalExams(350)
                        .build())
                .recentUsers(List.of(RecentUser.builder()
                        .userId(1201L)
                        .fullName("Nguyen Van A")
                        .email("student@gmail.com")
                        .role("STUDENT")
                        .createdAt(Instant.parse("2026-09-20T09:20:00Z"))
                        .build()))
                .build();

        UserPrincipal principal = UserPrincipal.create(1L, "admin@gmail.com", "ADMIN");
        when(dashboardService.getAdminDashboard()).thenReturn(body);

        mockMvc.perform(get("/api/v1/dashboard/admin").with(user(principal)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.message").doesNotExist())
                .andExpect(jsonPath("$.data.summary.totalUsers").value(2450))
                .andExpect(jsonPath("$.data.summary.totalStudents").value(2200))
                .andExpect(jsonPath("$.data.summary.totalManagers").value(15))
                .andExpect(jsonPath("$.data.summary.totalCourses").value(120))
                .andExpect(jsonPath("$.data.summary.totalExams").value(350))
                .andExpect(jsonPath("$.data.recentUsers[0].userId").value(1201))
                .andExpect(jsonPath("$.data.recentUsers[0].fullName").value("Nguyen Van A"))
                .andExpect(jsonPath("$.data.recentUsers[0].email").value("student@gmail.com"))
                .andExpect(jsonPath("$.data.recentUsers[0].role").value("STUDENT"))
                .andExpect(jsonPath("$.data.recentUsers[0].createdAt").value("2026-09-20T09:20:00Z"));

        verify(dashboardService).getAdminDashboard();
    }

    @Test
    void studentDashboard_Unauthenticated_Returns401() throws Exception {
        mockMvc.perform(get("/api/v1/dashboard/student"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.message").value("Authentication required or invalid token"));

        verifyNoInteractions(dashboardService);
    }

    @Test
    void adminDashboard_ForbiddenForStudent_Returns403() throws Exception {
        UserPrincipal principal = UserPrincipal.create(101L, "student@gmail.com", "STUDENT");

        mockMvc.perform(get("/api/v1/dashboard/admin").with(user(principal)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.message").value("Access denied."));

        verifyNoInteractions(dashboardService);
    }

    @Test
    void courseManagerDashboard_ForbiddenForStudent_Returns403() throws Exception {
        UserPrincipal principal = UserPrincipal.create(101L, "student@gmail.com", "STUDENT");

        mockMvc.perform(get("/api/v1/dashboard/course-manager").with(user(principal)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.message").value("Access denied."));

        verifyNoInteractions(dashboardService);
    }
}
