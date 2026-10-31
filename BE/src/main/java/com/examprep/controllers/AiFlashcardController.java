package com.examprep.controllers;

import com.examprep.dto.AiFlashcardDtos.GenerateAccepted;
import com.examprep.dto.ApiResponse;
import com.examprep.security.UserPrincipal;
import com.examprep.services.AiFlashcardService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

/**
 * API 31 (Deadline 2 group E). {@code /api/v1/ai/**} has no URL rule in SecurityConfig, so the
 * role guard is the method-level {@code @PreAuthorize}.
 */
@RestController
@RequestMapping("/api/v1/ai/flashcards")
@RequiredArgsConstructor
@PreAuthorize("hasAnyRole('STUDENT','COURSE_MANAGER')")
@Tag(name = "AI Flashcards")
public class AiFlashcardController {
    private final AiFlashcardService service;

    /** {@code text} XOR {@code file}; query parameters are accepted too, so no strict {@code consumes}. */
    @PostMapping("/generate")
    @Operation(summary = "API 31: Generate Flashcards")
    public ResponseEntity<ApiResponse<GenerateAccepted>> generate(
            @AuthenticationPrincipal UserPrincipal user,
            @RequestParam(name = "file", required = false) MultipartFile file,
            @RequestParam(name = "text", required = false) String text,
            @RequestParam(name = "numberOfCards", required = false) Integer numberOfCards,
            @RequestParam(name = "language", required = false, defaultValue = "AUTO") String language,
            @RequestParam(name = "style", required = false, defaultValue = "QA") String style,
            @RequestParam(name = "focusTopic", required = false) String focusTopic,
            @RequestParam(name = "courseId", required = false) Long courseId) {
        GenerateAccepted accepted = service.generate(user, file, text, numberOfCards, language, style, focusTopic, courseId);
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(ApiResponse.success(accepted, "Đã tiếp nhận yêu cầu"));
    }
}
