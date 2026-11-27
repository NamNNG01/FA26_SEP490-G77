package com.examprep.controllers;

import com.examprep.dto.AiFlashcardDtos.UsageInfo;
import com.examprep.dto.ApiResponse;
import com.examprep.entities.User;
import com.examprep.security.UserPrincipal;
import com.examprep.services.AiFlashcardService;
import com.examprep.services.ManagerAiQuotaService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * API 33 (Deadline 2 group E). {@code /api/v1/ai/**} has no URL rule in SecurityConfig, so the role
 * guard is the method-level {@code @PreAuthorize} (same trade-off as {@link AiFlashcardController}).
 */
@RestController
@RequiredArgsConstructor
@Tag(name = "AI Usage")
public class AiUsageController {
    private final AiFlashcardService service;
    private final ManagerAiQuotaService managerQuotaService;

    /** The caller's own quota: students use subscription/free quota; managers use monthly manager token quota. */
    @GetMapping("/api/v1/ai/usage/me")
    @PreAuthorize("hasAnyRole('STUDENT','COURSE_MANAGER')")
    @Operation(summary = "API 33: Get My AI Usage")
    public ResponseEntity<ApiResponse<UsageInfo>> usage(@AuthenticationPrincipal UserPrincipal user) {
        if (User.ROLE_COURSE_MANAGER.equals(user.getRole())) {
            return ResponseEntity.ok(ApiResponse.success(managerQuotaService.usageInfo(user.getId())));
        }
        return ResponseEntity.ok(ApiResponse.success(service.usage(user.getId())));
    }
}
