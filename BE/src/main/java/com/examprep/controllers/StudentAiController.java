package com.examprep.controllers;

import com.examprep.dto.ApiResponse;
import com.examprep.dto.StudentAiRequests;
import com.examprep.dto.StudentAiResponse;
import com.examprep.security.UserPrincipal;
import com.examprep.services.StudentAiService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

/** SE-01, SE-02, SQ-01 (student-exam-full-spec.md section 8). */
@RestController
@RequestMapping("/api/v1/student")
@RequiredArgsConstructor
public class StudentAiController {
    private final StudentAiService service;

    @PostMapping("/attempts/{attemptId}/explanations:batch")
    public ResponseEntity<ApiResponse<StudentAiResponse.ExplanationBatch>> explain(@AuthenticationPrincipal UserPrincipal user,
            @PathVariable Long attemptId, @Valid @RequestBody StudentAiRequests.ExplanationBatch request) {
        return ResponseEntity.ok(ApiResponse.success(service.explain(user, attemptId, request)));
    }

    @PostMapping("/attempts/{attemptId}/grading")
    public ResponseEntity<ApiResponse<StudentAiResponse.Grading>> grade(@AuthenticationPrincipal UserPrincipal user,
            @PathVariable Long attemptId, @Valid @RequestBody(required = false) StudentAiRequests.Grading request) {
        return ResponseEntity.status(HttpStatus.ACCEPTED)
                .body(ApiResponse.success(service.grade(user, attemptId, request), "Grading queued"));
    }

    @GetMapping("/me/ai-quota")
    public ResponseEntity<ApiResponse<StudentAiResponse.Quota>> quota(@AuthenticationPrincipal UserPrincipal user) {
        return ResponseEntity.ok(ApiResponse.success(service.quota(user)));
    }
}
