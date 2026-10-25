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

    @GetMapping("/attempts/{attemptId}")
    @Operation(summary = "SA-02: Reload an attempt",
            description = "The frozen paper plus the drafts already stored, so the student can resume exactly "
                    + "where they left off.")
    public ResponseEntity<ApiResponse<AttemptResponses.Session>> get(
            @AuthenticationPrincipal UserPrincipal currentUser,
            @PathVariable Long attemptId) {
        return ResponseEntity.ok(
                ApiResponse.success(attempts.get(currentUser.getId(), attemptId)));
    }

    @PutMapping("/attempts/{attemptId}/answers")
    @Operation(summary = "SA-03: Save drafts in batch",
            description = "Up to 50 answers per call, each with its own rising seq. Stale sequences are ignored, "
                    + "unknown questions and malformed payloads are reported per entry.")
    public ResponseEntity<ApiResponse<AttemptResponses.DraftSaved>> saveDrafts(
            @AuthenticationPrincipal UserPrincipal currentUser,
            @PathVariable Long attemptId,
            @Valid @RequestBody AttemptRequests.DraftSave body) {
        return ResponseEntity.ok(
                ApiResponse.success(attempts.saveDrafts(currentUser.getId(), attemptId, body), "Draft saved"));
    }

    @PostMapping("/attempts/{attemptId}/submit")
    @Operation(summary = "SA-04: Submit the attempt",
            description = "Applies the last drafts, grades every quiz answer, leaves rubric answers for the AI "
                    + "worker and closes the attempt. Calling it again just returns the current result.")
    public ResponseEntity<ApiResponse<AttemptResponses.Submitted>> submit(
            @AuthenticationPrincipal UserPrincipal currentUser,
            @PathVariable Long attemptId,
            @Valid @RequestBody(required = false) AttemptRequests.Submit body) {
        return ResponseEntity.ok(
                ApiResponse.success(attempts.submit(currentUser.getId(), attemptId, body), "Submitted"));
    }
}
