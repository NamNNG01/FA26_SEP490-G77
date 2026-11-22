package com.examprep.controllers;

import com.examprep.dto.ApiResponse;
import com.examprep.dto.DeckResponse;
import com.examprep.dto.PageResponse;
import com.examprep.services.admin.AdminCommunityDeckService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/admin/community-decks")
@RequiredArgsConstructor
@PreAuthorize("hasRole('ADMIN')")
@Tag(name = "Admin Community Decks", description = "Admin moderation for student community flashcard decks")
public class AdminCommunityDeckController {
    private final AdminCommunityDeckService service;

    @GetMapping
    @Operation(summary = "List student community flashcard decks")
    public ResponseEntity<ApiResponse<PageResponse<DeckResponse>>> list(
            @RequestParam(required = false, defaultValue = "PUBLIC") String visibility,
            @RequestParam(required = false) String reviewStatus,
            @RequestParam(required = false) String search,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return ResponseEntity.ok(ApiResponse.success(service.list(visibility, reviewStatus, search, page, size)));
    }

    @PatchMapping("/{id}/hide")
    @Operation(summary = "Unpublish and block a violating community deck")
    public ResponseEntity<ApiResponse<DeckResponse>> hide(
            @PathVariable Long id,
            @RequestBody(required = false) Map<String, String> body) {
        String reason = body != null ? body.get("reason") : null;
        return ResponseEntity.ok(ApiResponse.success(service.hideDeck(id, reason), "Community deck removed."));
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "Permanently delete a violating community deck")
    public ResponseEntity<ApiResponse<Void>> delete(@PathVariable Long id) {
        service.deleteDeck(id);
        return ResponseEntity.ok(ApiResponse.success(null, "Community deck deleted."));
    }
}
