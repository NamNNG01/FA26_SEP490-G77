package com.examprep.controllers;

import com.examprep.dto.AdminDashboardReport;
import com.examprep.dto.AdminDashboardResponse;
import com.examprep.dto.ApiResponse;
import com.examprep.dto.CourseManagerDashboardDtos;
import com.examprep.dto.CourseManagerDashboardResponse;
import com.examprep.dto.StudentDashboardResponse;
import com.examprep.security.UserPrincipal;
import com.examprep.services.AdminDashboardService;
import com.examprep.services.CourseManagerDashboardService;
import com.examprep.services.DashboardService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/v1/dashboard")
@RequiredArgsConstructor
@Tag(name = "Dashboard", description = "Role-scoped dashboard summary APIs")
public class DashboardController {

    private final DashboardService dashboardService;
    private final AdminDashboardService adminDashboardService;
    private final CourseManagerDashboardService courseManagerDashboardService;

    @GetMapping("/student")
    @PreAuthorize("hasAnyRole('STUDENT', 'ADMIN')")
    @Operation(summary = "DASH-01: Student Dashboard",
            description = "Returns enrollment, progress, score summary and recent activity for the logged-in student.")
    public ResponseEntity<ApiResponse<StudentDashboardResponse>> studentDashboard(
            @AuthenticationPrincipal UserPrincipal currentUser) {
        StudentDashboardResponse body = dashboardService.getStudentDashboard(currentUser.getId());
        return ResponseEntity.ok(ApiResponse.success(body, null));
    }

    @GetMapping("/course-manager")
    @PreAuthorize("hasAnyRole('COURSE_MANAGER', 'ADMIN')")
    @Operation(summary = "DASH-02: Course Manager Dashboard",
            description = "Returns course publication and student enrollment summaries for the logged-in course manager.")
    public ResponseEntity<ApiResponse<CourseManagerDashboardResponse>> courseManagerDashboard(
            @AuthenticationPrincipal UserPrincipal currentUser) {
        CourseManagerDashboardResponse body = dashboardService.getCourseManagerDashboard(currentUser.getId());
        return ResponseEntity.ok(ApiResponse.success(body, null));
    }

    @GetMapping("/admin")
    @PreAuthorize("hasRole('ADMIN')")
    @Operation(summary = "DASH-03: Admin Dashboard",
            description = "Returns global platform statistics and recent user registrations for administrators.")
    public ResponseEntity<ApiResponse<AdminDashboardResponse>> adminDashboard(
            @AuthenticationPrincipal UserPrincipal currentUser) {
        AdminDashboardResponse body = dashboardService.getAdminDashboard();
        return ResponseEntity.ok(ApiResponse.success(body, null));
    }

    // ---------------------------------------------------------------------------------------------
    // DASH-04: Admin dashboard report (admin only)
    // ---------------------------------------------------------------------------------------------

    @GetMapping("/admin/report")
    @PreAuthorize("hasRole('ADMIN')")
    @Operation(summary = "DASH-04: Admin Dashboard Report",
            description = "Revenue, users, courses and AI usage of the requested period, aggregated from "
                    + "the live database. `from`/`to` use the granularity's own format (YYYY-MM-DD for day, "
                    + "YYYY-MM for month, YYYY for year); periods are the server's calendar units. "
                    + "`sortBy` ranks the all-time top courses by revenue or enrollments. ADMIN only.")
    public ResponseEntity<ApiResponse<AdminDashboardReport>> adminReport(
            @RequestParam(required = false) String granularity,
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to,
            @RequestParam(required = false) String sortBy) {
        AdminDashboardReport body = adminDashboardService.report(granularity, from, to, sortBy);
        return ResponseEntity.ok(ApiResponse.success(body, null));
    }

    // ---------------------------------------------------------------------------------------------
    // DASH-05: Course Manager dashboard (course manager or admin)
    // ---------------------------------------------------------------------------------------------

    @GetMapping("/course-manager/summary")
    @PreAuthorize("hasAnyRole('COURSE_MANAGER', 'ADMIN')")
    @Operation(summary = "DASH-05a: Course Manager Dashboard Summary",
            description = "KPI figures of the caller's courses and the exams they created: managed courses, "
                    + "active students, my exams by status, submissions of the last 7 days, average score, "
                    + "pass rate (a graded attempt passes from "
                    + CourseManagerDashboardDtos.PASS_THRESHOLD_PERCENT + "% of the exam's max score) and "
                    + "attempts still waiting for grading.")
    public ResponseEntity<ApiResponse<CourseManagerDashboardDtos.Summary>> courseManagerSummary(
            @AuthenticationPrincipal UserPrincipal currentUser) {
        CourseManagerDashboardDtos.Summary body = courseManagerDashboardService.summary(currentUser.getId());
        return ResponseEntity.ok(ApiResponse.success(body, null));
    }

    @GetMapping("/course-manager/courses")
    @PreAuthorize("hasAnyRole('COURSE_MANAGER', 'ADMIN')")
    @Operation(summary = "DASH-05b: Course Manager Course Panel",
            description = "One row per course the caller manages: active students, exams they created, "
                    + "submitted attempts and score/pass rate. Lowest pass rate first, no data last.")
    public ResponseEntity<ApiResponse<List<CourseManagerDashboardDtos.CourseStat>>> courseManagerCourses(
            @AuthenticationPrincipal UserPrincipal currentUser) {
        List<CourseManagerDashboardDtos.CourseStat> body = courseManagerDashboardService.courses(currentUser.getId());
        return ResponseEntity.ok(ApiResponse.success(body, null));
    }

    @GetMapping("/course-manager/exams")
    @PreAuthorize("hasAnyRole('COURSE_MANAGER', 'ADMIN')")
    @Operation(summary = "DASH-05c: Course Manager Exam Panel",
            description = "One row per course exam the caller created: submissions, average score, pass rate, "
                    + "average duration and pending grading. Lowest pass rate first; exams under "
                    + "`minAttempts` submissions (default 5) rank last. `courseId` filters to one managed course.")
    public ResponseEntity<ApiResponse<List<CourseManagerDashboardDtos.ExamStat>>> courseManagerExams(
            @AuthenticationPrincipal UserPrincipal currentUser,
            @RequestParam(required = false) Long courseId,
            @RequestParam(required = false) Integer minAttempts) {
        List<CourseManagerDashboardDtos.ExamStat> body =
                courseManagerDashboardService.exams(currentUser.getId(), courseId, minAttempts);
        return ResponseEntity.ok(ApiResponse.success(body, null));
    }
}
