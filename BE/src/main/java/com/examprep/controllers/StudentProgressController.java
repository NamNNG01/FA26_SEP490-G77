package com.examprep.controllers;

import com.examprep.dto.ApiResponse;
import com.examprep.dto.PageResponse;
import com.examprep.dto.student.CourseProgressDto;
import com.examprep.dto.student.StudentActivityDto;
import com.examprep.security.UserPrincipal;
import com.examprep.services.student.StudentProgressService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/student/progress")
@RequiredArgsConstructor
@Tag(name = "Student Progress", description = "Student learning progress and activity history APIs")
public class StudentProgressController {

    private final StudentProgressService studentProgressService;

    @GetMapping("/courses/{courseId}")
    @Operation(summary = "LP-01: Course Progress", description = "Returns progress summary for a specific enrolled course.")
    public ResponseEntity<ApiResponse<CourseProgressDto>> getCourseProgress(
            @PathVariable Long courseId,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        CourseProgressDto dto = studentProgressService.getCourseProgress(courseId, currentUser.getId());
        return ResponseEntity.ok(ApiResponse.success(dto));
    }

    @GetMapping("/activities")
    @Operation(summary = "LP-02: Activity History", description = "Returns student learning activity history with optional filtering by type.")
    public ResponseEntity<ApiResponse<PageResponse<StudentActivityDto>>> getActivityHistory(
            @RequestParam(required = false) String type,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        Page<StudentActivityDto> p = studentProgressService.getActivityHistory(type, page, size, currentUser.getId());
        return ResponseEntity.ok(ApiResponse.success(PageResponse.of(p)));
    }
}
