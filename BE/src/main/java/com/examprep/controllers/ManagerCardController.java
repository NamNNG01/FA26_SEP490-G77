package com.examprep.controllers;

import com.examprep.dto.ApiResponse;
import com.examprep.dto.CardResponse;
import com.examprep.dto.DeckRequests;
import com.examprep.security.UserPrincipal;
import com.examprep.services.DeckService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/manager/cards")
@RequiredArgsConstructor
@PreAuthorize("hasAnyRole('COURSE_MANAGER', 'ADMIN')")
@Tag(name = "Manager Cards", description = "Card operations addressed directly by card id (F-07..08); "
        + "permissions are always derived from the card's deck")
public class ManagerCardController {

    private final DeckService service;

    @PutMapping("/{id}")
    @Operation(summary = "F-07: Update the supplied faces of a card",
            description = "Partial update: send only the faces you want to change. "
                    + "Blank or missing values leave the stored face untouched.")
    public ResponseEntity<ApiResponse<CardResponse>> update(@AuthenticationPrincipal UserPrincipal user,
            @PathVariable Long id, @Valid @RequestBody DeckRequests.CardUpdate request) {
        return ResponseEntity.ok(ApiResponse.success(service.updateCard(user, id, request)));
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "F-08: Delete a card and its per-user progress",
            description = "Removes the card; study progress recorded for that card goes with it.")
    public ResponseEntity<ApiResponse<Void>> delete(@AuthenticationPrincipal UserPrincipal user, @PathVariable Long id) {
        service.deleteCard(user, id);
        return ResponseEntity.ok(ApiResponse.success(null, "Card deleted successfully."));
    }
}
