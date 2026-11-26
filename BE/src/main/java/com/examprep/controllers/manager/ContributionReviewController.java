package com.examprep.controllers.manager;

import com.examprep.dto.ApiResponse;
import com.examprep.security.UserPrincipal;
import com.examprep.services.manager.review.ContributionReviewService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/manager/contributions")
@RequiredArgsConstructor
@PreAuthorize("hasRole('COURSE_MANAGER')")
@Tag(name = "Manager Contribution Review", description = "Manager review for student contributed questions")
public class ContributionReviewController {

    private final ContributionReviewService service;

    @GetMapping
    @Operation(summary = "List contributed questions")
    public ResponseEntity<ApiResponse<Map<String, Object>>> list(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(required = false) Long courseId,
            @RequestParam(required = false) Long moduleId,
            @RequestParam(required = false) String questionType,
            @RequestParam(required = false) String difficulty,
            @RequestParam(required = false, defaultValue = "PENDING") String status,
            @RequestParam(required = false) Long contributorId,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) Instant submittedFrom,
            @RequestParam(required = false) Instant submittedTo,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(defaultValue = "submittedAt,desc") String sort) {
        Map<String, Object> data = service.listContributions(
                principal.getId(), courseId, moduleId, questionType, difficulty,
                status, contributorId, keyword, submittedFrom, submittedTo, page, size, sort
        );
        return ResponseEntity.ok(ApiResponse.success(data));
    }

    @GetMapping("/{id}")
    @Operation(summary = "Get contribution detail")
    public ResponseEntity<ApiResponse<Map<String, Object>>> detail(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable Long id) {
        Map<String, Object> data = service.getContributionDetail(principal.getId(), id);
        return ResponseEntity.ok(ApiResponse.success(data));
    }

    @PostMapping("/{id}/approve")
    @Operation(summary = "Approve contribution")
    public ResponseEntity<ApiResponse<Map<String, Object>>> approve(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable Long id,
            @RequestBody(required = false) Map<String, Object> body) {
        Long version = extractVersion(body);
        String note = extractText(body, "note");
        Map<String, Object> result = service.approve(principal.getId(), id, version, note);
        return ResponseEntity.ok(ApiResponse.success(result, "Question approved."));
    }

    @PostMapping("/{id}/reject")
    @Operation(summary = "Reject contribution")
    public ResponseEntity<ApiResponse<Map<String, Object>>> reject(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable Long id,
            @RequestBody(required = false) Map<String, Object> body) {
        Long version = extractVersion(body);
        String reason = extractText(body, "reason");
        Map<String, Object> result = service.reject(principal.getId(), id, version, reason);
        return ResponseEntity.ok(ApiResponse.success(result, "Question rejected."));
    }

    @GetMapping("/stats")
    @Operation(summary = "Contribution stats")
    public ResponseEntity<ApiResponse<Map<String, Object>>> stats(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(required = false) Long courseId) {
        Map<String, Object> data = service.stats(principal.getId(), courseId);
        return ResponseEntity.ok(ApiResponse.success(data));
    }

    private Long extractVersion(Map<String, Object> body) {
        if (body != null && body.get("version") instanceof Number n) {
            return n.longValue();
        }
        return null;
    }

    private String extractText(Map<String, Object> body, String key) {
        if (body != null && body.get(key) != null) {
            return String.valueOf(body.get(key));
        }
        return null;
    }
}
