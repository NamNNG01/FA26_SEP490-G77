package com.examprep.controllers;

import com.examprep.dto.ApiResponse;
import com.examprep.dto.PageResponse;
import com.examprep.dto.student.StudentDeckDtos.*;
import com.examprep.security.UserPrincipal;
import com.examprep.services.student.CardImportService;
import com.examprep.services.student.StudentDeckService;
import com.examprep.services.student.StudentStudyService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

/** Personal flashcards and study: FC-01..13, FP-01..03, FV-01 (Deadline1 sections 14-15). */
@RestController
@RequestMapping("/api/v1/student")
@RequiredArgsConstructor
public class StudentDeckController {
    private final StudentDeckService decks;
    private final StudentStudyService study;
    private final CardImportService imports;

    @GetMapping("/decks")
    public ResponseEntity<ApiResponse<PageResponse<DeckListItem>>> list(@AuthenticationPrincipal UserPrincipal user,
            @RequestParam(required = false) String scope, @RequestParam(required = false) Long courseId, @RequestParam(required = false) String search,
            @RequestParam(required = false) String mode, @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return ResponseEntity.ok(ApiResponse.success(decks.list(user.getId(), scope, courseId, search, mode, page, size)));
    }

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

    @PutMapping("/cards/{cardId}/progress")
    public ResponseEntity<ApiResponse<ProgressView>> progress(@AuthenticationPrincipal UserPrincipal user, @PathVariable Long cardId,
            @Valid @RequestBody ProgressWrite request) {
        return ResponseEntity.ok(ApiResponse.success(study.writeProgress(user.getId(), cardId, request)));
    }

    @PutMapping("/decks/{deckId}/learn-all")
    public ResponseEntity<ApiResponse<DeckLearnedView>> learnAll(@AuthenticationPrincipal UserPrincipal user, @PathVariable Long deckId) {
        return ResponseEntity.ok(ApiResponse.success(study.learnAll(user.getId(), deckId)));
    }

    @PostMapping("/decks/{deckId}/study-sessions")
    public ResponseEntity<ApiResponse<StudySessionView>> startSession(@AuthenticationPrincipal UserPrincipal user, @PathVariable Long deckId,
            @Valid @RequestBody SessionStart request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(study.startSession(user.getId(), deckId, request), "Study session started"));
    }

    @PostMapping("/study-sessions/{sessionId}/finish")
    public ResponseEntity<ApiResponse<SessionSummary>> finishSession(@AuthenticationPrincipal UserPrincipal user, @PathVariable String sessionId,
            @Valid @RequestBody(required = false) SessionFinish request) {
        return ResponseEntity.ok(ApiResponse.success(study.finishSession(user.getId(), sessionId, request)));
    }

    @GetMapping("/decks/{deckId}/review-cards")
    public ResponseEntity<ApiResponse<List<StudyCard>>> reviewCards(@AuthenticationPrincipal UserPrincipal user, @PathVariable Long deckId,
            @RequestParam(defaultValue = "20") int limit) {
        return ResponseEntity.ok(ApiResponse.success(study.reviewCards(user.getId(), deckId, limit)));
    }

    @GetMapping("/decks/{deckId}/viewer")
    public ResponseEntity<ApiResponse<ViewerView>> viewer(@AuthenticationPrincipal UserPrincipal user, @PathVariable Long deckId,
            @RequestParam(defaultValue = "0") int cardLimit) {
        return ResponseEntity.ok(ApiResponse.success(study.viewer(user.getId(), deckId, cardLimit)));
    }

    @PostMapping(value = "/decks/{deckId}/cards/import", consumes = "multipart/form-data")
    public ResponseEntity<ApiResponse<CardImportService.Started>> importCards(@AuthenticationPrincipal UserPrincipal user,
            @PathVariable Long deckId, @RequestParam("file") MultipartFile file) {
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(ApiResponse.success(imports.start(user.getId(), deckId, file), "Import started"));
    }

    @GetMapping("/decks/{deckId}/imports/{importId}")
    public ResponseEntity<ApiResponse<CardImportService.Status>> importStatus(@AuthenticationPrincipal UserPrincipal user,
            @PathVariable Long deckId, @PathVariable Long importId) {
        CardImportService.Status status = imports.status(user.getId(), deckId, importId);
        ResponseEntity.BodyBuilder reply = ResponseEntity.ok();
        if ("PROCESSING".equals(status.status())) reply.header("Retry-After", "2");
        return reply.body(ApiResponse.success(status));
    }

    @PostMapping("/decks/{deckId}/cards/from-question")
    public ResponseEntity<ApiResponse<CardFromQuestionView>> fromQuestion(@AuthenticationPrincipal UserPrincipal user,
            @PathVariable Long deckId, @Valid @RequestBody FromQuestion request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(decks.cardFromQuestion(user.getId(), deckId, request), "Card created from question"));
    }
}
