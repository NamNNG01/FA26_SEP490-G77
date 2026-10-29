package com.examprep.controllers;

import com.examprep.dto.ApiResponse;
import com.examprep.dto.student.StudentDeckDtos.*;
import com.examprep.security.UserPrincipal;
import com.examprep.services.student.StudentDeckService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

/** Personal flashcards: FC-01..06, FC-10 (Deadline1 section 14). */
@RestController
@RequestMapping("/api/v1/student")
@RequiredArgsConstructor
public class StudentDeckController {
    private final StudentDeckService decks;

    @PostMapping("/decks")
    public ResponseEntity<ApiResponse<DeckView>> create(@AuthenticationPrincipal UserPrincipal user, @Valid @RequestBody DeckCreate request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(decks.create(user.getId(), request), "Deck created"));
    }

    @PutMapping("/decks/{deckId}")
    public ResponseEntity<ApiResponse<DeckView>> update(@AuthenticationPrincipal UserPrincipal user, @PathVariable Long deckId,
            @Valid @RequestBody DeckUpdate request) {
        return ResponseEntity.ok(ApiResponse.success(decks.update(user.getId(), deckId, request)));
    }

    @DeleteMapping("/decks/{deckId}")
    public ResponseEntity<ApiResponse<Void>> delete(@AuthenticationPrincipal UserPrincipal user, @PathVariable Long deckId) {
        decks.delete(user.getId(), deckId);
        return ResponseEntity.ok(ApiResponse.success(null, "Deleted"));
    }

    @PostMapping("/decks/{deckId}/cards")
    public ResponseEntity<ApiResponse<CardView>> addCard(@AuthenticationPrincipal UserPrincipal user, @PathVariable Long deckId,
            @Valid @RequestBody CardWrite request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(decks.addCard(user.getId(), deckId, request), "Card created"));
    }

    @PutMapping("/cards/{cardId}")
    public ResponseEntity<ApiResponse<CardView>> updateCard(@AuthenticationPrincipal UserPrincipal user, @PathVariable Long cardId,
            @Valid @RequestBody CardWrite request) {
        return ResponseEntity.ok(ApiResponse.success(decks.updateCard(user.getId(), cardId, request)));
    }

    @DeleteMapping("/cards/{cardId}")
    public ResponseEntity<ApiResponse<Void>> deleteCard(@AuthenticationPrincipal UserPrincipal user, @PathVariable Long cardId) {
        decks.deleteCard(user.getId(), cardId);
        return ResponseEntity.ok(ApiResponse.success(null, "Deleted"));
    }

    @PostMapping("/decks/{deckId}/publish-request")
    public ResponseEntity<ApiResponse<PublishRequestView>> publishRequest(@AuthenticationPrincipal UserPrincipal user, @PathVariable Long deckId) {
        return ResponseEntity.ok(ApiResponse.success(decks.requestPublish(user.getId(), deckId), "Sent for review"));
    }
}
