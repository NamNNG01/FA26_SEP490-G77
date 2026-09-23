package com.examprep.controllers;

import com.examprep.dto.AdminDashboardResponse;
import com.examprep.dto.ApiResponse;
import com.examprep.dto.CourseManagerDashboardResponse;
import com.examprep.dto.StudentDashboardResponse;
import com.examprep.security.UserPrincipal;
import com.examprep.services.DashboardService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/dashboard")
@RequiredArgsConstructor
@Tag(name = "Dashboard", description = "Role-scoped dashboard summary APIs")
public class DashboardController {

    private final DashboardService dashboardService;

    @GetMapping("/student")
    @Operation(summary = "DASH-01: Student Dashboard",
            description = "Returns enrollment, progress, score summary and recent activity for the logged-in student.")
    public ResponseEntity<ApiResponse<StudentDashboardResponse>> studentDashboard(
            @AuthenticationPrincipal UserPrincipal currentUser) {
        StudentDashboardResponse body = dashboardService.getStudentDashboard(currentUser.getId());
        return ResponseEntity.ok(ApiResponse.success(body, null));
    }

    @GetMapping("/course-manager")
    @Operation(summary = "DASH-02: Course Manager Dashboard",
            description = "Returns course publication and student enrollment summaries for the logged-in course manager.")
    public ResponseEntity<ApiResponse<CourseManagerDashboardResponse>> courseManagerDashboard(
            @AuthenticationPrincipal UserPrincipal currentUser) {
        CourseManagerDashboardResponse body = dashboardService.getCourseManagerDashboard(currentUser.getId());
        return ResponseEntity.ok(ApiResponse.success(body, null));
    }

    @GetMapping("/admin")
    @Operation(summary = "DASH-03: Admin Dashboard",
            description = "Returns global platform statistics and recent user registrations for administrators.")
    public ResponseEntity<ApiResponse<AdminDashboardResponse>> adminDashboard(
            @AuthenticationPrincipal UserPrincipal currentUser) {
        AdminDashboardResponse body = dashboardService.getAdminDashboard();
        return ResponseEntity.ok(ApiResponse.success(body, null));
    }
}
