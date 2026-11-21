package com.examprep.controllers;

import com.examprep.dto.AdminPlanDtos.*;
import com.examprep.dto.ApiResponse;
import com.examprep.dto.PageResponse;
import com.examprep.services.admin.AdminSubscriptionPlanService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/admin/subscription-plans")
@RequiredArgsConstructor
@PreAuthorize("hasRole('ADMIN')")
@Tag(name = "Admin Subscription Plans")
public class AdminSubscriptionPlanController {

    private static final List<FeatureKey> FEATURE_KEYS = List.of(
            new FeatureKey("AI_FLASHCARD_GENERATION", "AI flashcards", "Generate flashcards from study materials"),
            new FeatureKey("AI_QUIZ_FROM_MATERIAL", "AI quizzes", "Generate quizzes from study materials"),
            new FeatureKey("AI_ESSAY_GRADING", "Essay grading", "Grade essay answers with AI"),
            new FeatureKey("WEAKNESS_REPORT", "Weakness report", "Generate a detailed weakness report"),
            new FeatureKey("SMART_PRACTICE", "Smart practice", "Generate adaptive practice"),
            new FeatureKey("PERSONALISED_RECOMMENDATIONS", "Recommendations", "Personalised study recommendations"),
            new FeatureKey("WEAK_SPOTS", "Weak spots", "View weak question topics"),
            new FeatureKey("EARLY_ACCESS", "Early access", "Access new features early"));

    public record FeatureKey(String key, String label, String description) {}

    private final AdminSubscriptionPlanService service;

    /**
     * @deprecated Plans now use token-limit-only pricing (per commit 06dfa66); kept for API backward compatibility.
     */
    @Deprecated(forRemoval = false)
    @GetMapping("/feature-keys")
    public ResponseEntity<ApiResponse<List<FeatureKey>>> featureKeys() {
        return ResponseEntity.ok(ApiResponse.success(FEATURE_KEYS));
    }

    @GetMapping
    @Operation(summary = "API 20: Admin Subscription Plan List")
    public ResponseEntity<ApiResponse<PageResponse<PlanItem>>> list(
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) Boolean isActive,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(defaultValue = "sortOrder,asc") String sort) {
        return ResponseEntity.ok(ApiResponse.success(service.listPage(keyword, isActive, page, size, sort)));
    }

    @GetMapping("/{id}")
    @Operation(summary = "API 21: Admin Subscription Plan Detail")
    public ResponseEntity<ApiResponse<PlanDetail>> detail(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.success(service.detail(id)));
    }

    @PostMapping
    @Operation(summary = "API 22: Create Subscription Plan")
    public ResponseEntity<ApiResponse<PlanDetail>> create(@Valid @RequestBody PlanWriteRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(service.create(request), "Plan created"));
    }

    @PutMapping("/{id}")
    @Operation(summary = "API 23: Update Subscription Plan")
    public ResponseEntity<ApiResponse<PlanDetail>> update(@PathVariable Long id, @Valid @RequestBody PlanWriteRequest request) {
        return ResponseEntity.ok(ApiResponse.success(service.update(id, request)));
    }

    @PatchMapping("/{id}/status")
    @Operation(summary = "API 24: Toggle Subscription Plan Status")
    public ResponseEntity<ApiResponse<StatusUpdateResponse>> updateStatus(@PathVariable Long id, @Valid @RequestBody StatusUpdateRequest request) {
        return ResponseEntity.ok(ApiResponse.success(service.setStatus(id, request)));
    }

    /** Cannot collide with {@code /{id}}: Spring pattern specificity always prefers the literal {@code /reorder} segment over the {@code /{id}} template. */
    @PutMapping("/reorder")
    @Operation(summary = "API 25: Reorder Subscription Plans")
    public ResponseEntity<ApiResponse<List<PlanItem>>> reorder(@Valid @RequestBody ReorderRequest request) {
        return ResponseEntity.ok(ApiResponse.success(service.reorder(request)));
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "API 26: Soft Delete Subscription Plan")
    public ResponseEntity<ApiResponse<Void>> delete(@PathVariable Long id) {
        service.delete(id);
        return ResponseEntity.ok(ApiResponse.success(null, "Plan deleted"));
    }
}
