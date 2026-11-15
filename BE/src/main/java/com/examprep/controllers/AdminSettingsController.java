package com.examprep.controllers;

import com.examprep.dto.ApiResponse;
import com.examprep.security.UserPrincipal;
import com.examprep.services.AdminSettingsService;
import com.fasterxml.jackson.databind.JsonNode;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/admin/settings")
@RequiredArgsConstructor
@PreAuthorize("hasRole('ADMIN')")
@Tag(name = "Admin Settings", description = "Persisted platform settings for the System Settings screen")
public class AdminSettingsController {

    private final AdminSettingsService service;

    @GetMapping
    @Operation(summary = "AS-01: Read the platform settings document",
            description = "ADMIN only. Returns the stored settings JSON object, or an empty object "
                    + "when nothing has been saved yet.")
    public ResponseEntity<ApiResponse<JsonNode>> get() {
        return ResponseEntity.ok(ApiResponse.success(service.get()));
    }

    @PutMapping
    @Operation(summary = "AS-02: Persist the platform settings document",
            description = "ADMIN only. Stores the posted JSON object and returns it, so the screen "
                    + "can confirm that what it shows is what a reload will read.")
    public ResponseEntity<ApiResponse<JsonNode>> save(
            @AuthenticationPrincipal UserPrincipal actor,
            @RequestBody JsonNode document) {
        return ResponseEntity.ok(ApiResponse.success(service.save(document, actor.getId()), "Settings saved."));
    }
}
