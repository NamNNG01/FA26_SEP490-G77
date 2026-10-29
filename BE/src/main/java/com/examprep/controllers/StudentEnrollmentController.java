package com.examprep.controllers;

import com.examprep.dto.ApiResponse;
import com.examprep.dto.student.EnrollmentRequests;
import com.examprep.dto.student.EnrollmentResponses;
import com.examprep.security.UserPrincipal;
import com.examprep.services.EnrollmentService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/student")
@RequiredArgsConstructor
@Tag(name = "Student Enrollment")
public class StudentEnrollmentController {
    private final EnrollmentService service;

    @PostMapping("/courses/{courseId}/checkout")
    @Operation(summary = "EN-01: Create course checkout")
    public ResponseEntity<ApiResponse<EnrollmentResponses.Checkout>> checkout(
            @AuthenticationPrincipal UserPrincipal user, @PathVariable Long courseId,
            @Valid @RequestBody(required = false) EnrollmentRequests.Checkout body,
            @RequestParam(required = false) @Size(max = 50) String discountCode) {
        String code = body != null && body.discountCode() != null ? body.discountCode() : discountCode;
        return ResponseEntity.status(201).body(ApiResponse.success(service.checkout(user.getId(), courseId, code), "Checkout created"));
    }

    @PostMapping("/courses/{courseId}/enroll")
    @Operation(summary = "EN-02: Enroll in free course")
    public ResponseEntity<ApiResponse<EnrollmentResponses.Enrolled>> enroll(
            @AuthenticationPrincipal UserPrincipal user, @PathVariable Long courseId) {
        return ResponseEntity.status(201).body(ApiResponse.success(service.enrollFree(user.getId(), courseId), "Enrolled"));
    }

    @GetMapping("/courses/{courseId}/enrollment")
    @Operation(summary = "EN-03: Get enrollment state")
    public ResponseEntity<ApiResponse<EnrollmentResponses.State>> state(
            @AuthenticationPrincipal UserPrincipal user, @PathVariable Long courseId) {
        return ResponseEntity.ok(ApiResponse.success(service.state(user.getId(), courseId)));
    }

    @DeleteMapping("/my-courses/{courseId}")
    @Operation(summary = "EN-04: Cancel enrollment")
    public ResponseEntity<ApiResponse<EnrollmentResponses.Cancelled>> cancel(
            @AuthenticationPrincipal UserPrincipal user, @PathVariable Long courseId) {
        return ResponseEntity.ok(ApiResponse.success(service.cancel(user.getId(), courseId), "Unenrolled"));
    }
}
