package com.examprep.controllers;

import com.examprep.dto.ApiResponse;
import com.examprep.dto.PageResponse;
import com.examprep.dto.attempt.AttemptRequests;
import com.examprep.dto.attempt.AttemptResponses;
import com.examprep.security.UserPrincipal;
import com.examprep.services.StudentAttemptService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.util.UriComponentsBuilder;

import java.net.URI;

/**
 * Student exam-taking APIs (spec 6.1-6.5, 5.2): SA-01 … SA-06.
 *
 * <p>Every route lives under {@code /api/v1/student/**}, which {@code SecurityConfig} already
 * restricts to the STUDENT role (admin included for support).</p>
 */
@RestController
@RequestMapping("/api/v1/student")
@RequiredArgsConstructor
@Tag(name = "Student Attempt", description = "Taking an exam: start, reload, save drafts, submit, result, history")
public class StudentAttemptController {

    private final StudentAttemptService attempts;

    @PostMapping("/exams/{examId}/attempts")
    @Operation(summary = "SA-01: Start an attempt",
            description = "Creates the attempt, freezes the paper into snapshots and returns the questions. "
                    + "Idempotent for 24 hours per (student, Idempotency-Key).")
    public ResponseEntity<ApiResponse<AttemptResponses.Session>> start(
            @AuthenticationPrincipal UserPrincipal currentUser,
            @PathVariable Long examId,
            @RequestHeader(name = "Idempotency-Key", required = false) String idempotencyKey) {
        AttemptResponses.Session body = attempts.start(currentUser.getId(), examId, idempotencyKey);
        URI location = UriComponentsBuilder
                .fromPath("/api/v1/student/attempts/{attemptId}")
                .buildAndExpand(body.attemptId())
                .toUri();
        return ResponseEntity.created(location)
                .body(ApiResponse.success(body, "Attempt started"));
    }
}
