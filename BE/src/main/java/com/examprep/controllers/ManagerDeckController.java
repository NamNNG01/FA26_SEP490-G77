package com.examprep.controllers;

import com.examprep.dto.*;
import com.examprep.entities.User;
import com.examprep.repositories.UserRepository;
import com.examprep.security.UserPrincipal;
import com.examprep.services.DeckService;
import com.examprep.services.contest.ContestRules;
import com.examprep.services.manager.review.DeckReviewService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;

@RestController
@RequestMapping("/api/v1/manager/decks")
@RequiredArgsConstructor
@PreAuthorize("hasAnyRole('COURSE_MANAGER', 'ADMIN')")
@Tag(name = "Manager Decks", description = "Scoped flashcard deck and card administration (F-01..08)")
public class ManagerDeckController {
    private final DeckService service;
    private final DeckReviewService reviewService;
    private final UserRepository userRepository;

    /**
     * F-01, or — when {@code status} is sent — the student-contributed decks (decks students submitted for
     * review) in the caller's courses. A blank status means PENDING_REVIEW; PENDING/ACCEPTED are accepted
     * aliases of PENDING_REVIEW/APPROVED and ALL removes the filter.
     */
    @GetMapping
    @Operation(summary = "F-01: List managed decks",
            description = "With a status filter, lists student contributed decks by review status instead.")
    public ResponseEntity<ApiResponse<?>> list(@AuthenticationPrincipal UserPrincipal user,
            @RequestParam(required = false) String search, @RequestParam(required = false) Long courseId,
            @RequestParam(required = false) Long moduleId,
            @RequestParam(required = false) Boolean isPublic, @RequestParam(required = false) String status,
            @RequestParam(required = false) Long contributorId, @RequestParam(required = false) String keyword,
            @RequestParam(required = false) Instant submittedFrom, @RequestParam(required = false) Instant submittedTo,
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size,
            @RequestParam(defaultValue = "submittedAt,asc") String sort) {
        if (status != null) {
            User manager = userRepository.findById(user.getId())
                    .orElseThrow(() -> new com.examprep.exceptions.ResourceNotFoundException("User not found."));
            return ResponseEntity.ok(ApiResponse.success(reviewService.listContributedDecks(manager, courseId,
                    moduleId, status, contributorId, keyword, submittedFrom, submittedTo, page, size, sort)));
        }
        return ResponseEntity.ok(ApiResponse.success(service.list(user, search, courseId, moduleId, isPublic, page, size)));
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "F-02: Create a deck")
    public ResponseEntity<ApiResponse<DeckResponse>> create(@AuthenticationPrincipal UserPrincipal user,
            @Valid @RequestBody DeckRequests.Create request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(service.create(user, request), ResponseCode.CREATED.getMessage()));
    }

    @GetMapping("/{id}")
    @Operation(summary = "F-03: Get deck and cards with owner's progress")
    public ResponseEntity<ApiResponse<DeckResponse>> detail(@AuthenticationPrincipal UserPrincipal user, @PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.success(service.detail(user, id)));
    }

    @PutMapping("/{id}")
    @Operation(summary = "F-04: Update supplied deck fields")
    public ResponseEntity<ApiResponse<DeckResponse>> update(@AuthenticationPrincipal UserPrincipal user, @PathVariable Long id,
            @Valid @RequestBody DeckRequests.Update request) {
        return ResponseEntity.ok(ApiResponse.success(service.update(user, id, request)));
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "F-05: Delete a deck, its cards and related progress")
    public ResponseEntity<ApiResponse<Void>> delete(@AuthenticationPrincipal UserPrincipal user, @PathVariable Long id) {
        service.delete(user, id);
        return ResponseEntity.ok(ApiResponse.success(null, "Deck deleted successfully."));
    }

    @PostMapping("/{id}/cards")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "F-06: Append a card to a deck",
            description = "COURSE_MANAGER/ADMIN with access to the deck. Both faces are required.")
    public ResponseEntity<ApiResponse<CardResponse>> addCard(@AuthenticationPrincipal UserPrincipal user,
            @PathVariable Long id, @Valid @RequestBody DeckRequests.CardCreate request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(service.addCard(user, id, request), ResponseCode.CREATED.getMessage()));
    }

    @GetMapping("/{id}/export")
    @Operation(summary = "Export a managed deck's flashcards as PDF")
    public ResponseEntity<byte[]> export(@AuthenticationPrincipal UserPrincipal user, @PathVariable Long id,
            @RequestParam(defaultValue = "pdf") String format) {
        if (!"pdf".equalsIgnoreCase(format)) {
            throw ContestRules.error(ResponseCode.BAD_REQUEST, "INVALID_FORMAT", "Invalid export format. Supported: pdf");
        }
        com.examprep.util.FlashcardPdfWriter.RenderedPdf pdf = service.exportPdf(user, id);
        return ResponseEntity.ok().contentType(MediaType.APPLICATION_PDF)
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + pdf.fileName() + "\"")
                .body(pdf.content());
    }
}
