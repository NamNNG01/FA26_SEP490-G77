package com.examprep.controllers.manager;

import com.examprep.dto.ApiResponse;
import com.examprep.entities.Deck;
import com.examprep.entities.ReviewLog;
import com.examprep.entities.User;
import com.examprep.repositories.FlashcardRepository;
import com.examprep.repositories.ReviewLogRepository;
import com.examprep.repositories.UserRepository;
import com.examprep.security.UserPrincipal;
import com.examprep.services.manager.review.DeckReviewService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/manager/decks/review")
@RequiredArgsConstructor
@PreAuthorize("hasAnyRole('COURSE_MANAGER', 'ADMIN')")
@Tag(name = "Manager Deck Review", description = "Manager review for student submitted flashcard decks")
public class DeckReviewController {

    private final DeckReviewService service;
    private final FlashcardRepository flashcardRepository;
    private final UserRepository userRepository;
    private final ReviewLogRepository reviewLogRepository;

    private User getUser(UserPrincipal principal) {
        return userRepository.findById(principal.getId())
                .orElseThrow(() -> new com.examprep.exceptions.ResourceNotFoundException("User not found"));
    }

    @GetMapping
    @Operation(summary = "List reviewable decks")
    public ResponseEntity<ApiResponse<Map<String, Object>>> list(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(required = false) Long courseId,
            @RequestParam(required = false) Long moduleId,
            @RequestParam(required = false, defaultValue = "PENDING") String status,
            @RequestParam(required = false) Long contributorId,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) Instant submittedFrom,
            @RequestParam(required = false) Instant submittedTo,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(defaultValue = "submittedAt,asc") String sort) {
        if (size > 100) size = 100;
        String[] sortParts = sort.split(",");
        Sort.Direction direction = sortParts.length > 1 && "desc".equalsIgnoreCase(sortParts[1]) ? Sort.Direction.DESC : Sort.Direction.ASC;
        String sortField = sortParts[0];
        Pageable pageable = PageRequest.of(page, size, Sort.by(direction, sortField));

        User manager = getUser(principal);
        Page<Deck> pageResult = service.listDecks(manager, courseId, moduleId, status, contributorId, keyword, submittedFrom, submittedTo, pageable);

        List<Map<String, Object>> content = pageResult.getContent().stream().map(d -> {
            boolean canReview = "PENDING".equalsIgnoreCase(d.getReviewStatus()) && !d.getUser().getUserId().equals(manager.getUserId());
            Map<String, Object> map = new HashMap<>();
            map.put("deckId", d.getDeckId());
            map.put("title", d.getTitle());
            map.put("description", d.getDescription() != null ? d.getDescription() : "");
            map.put("cardCount", flashcardRepository.countByDeckDeckId(d.getDeckId()));
            map.put("owner", Map.of("id", d.getUser().getUserId(), "fullName", d.getUser().getFullName()));
            map.put("course", d.getCourse() != null ? Map.of("id", d.getCourse().getCourseId(), "title", d.getCourse().getTitle()) : Map.of());
            map.put("module", d.getModule() != null ? Map.of("id", d.getModule().getModuleId(), "title", d.getModule().getTitle()) : Map.of());
            map.put("reviewStatus", d.getReviewStatus());
            map.put("resubmissionCount", d.getResubmissionCount() != null ? d.getResubmissionCount() : 0);
            map.put("submittedAt", d.getSubmittedAt() != null ? d.getSubmittedAt() : Instant.now());
            map.put("reviewedAt", d.getUpdatedAt() != null ? d.getUpdatedAt() : null);
            map.put("version", d.getVersion() != null ? d.getVersion() : 0L);
            map.put("canReview", canReview);
            return (Map<String, Object>) map;
        }).toList();

        Map<String, Object> data = new HashMap<>();
        data.put("content", content);
        data.put("page", pageResult.getNumber());
        data.put("size", pageResult.getSize());
        data.put("totalElements", pageResult.getTotalElements());
        data.put("totalPages", pageResult.getTotalPages());
        data.put("first", pageResult.isFirst());
        data.put("last", pageResult.isLast());

        return ResponseEntity.ok(ApiResponse.success(data));
    }

    @GetMapping("/{id}")
    @Operation(summary = "Get deck review detail")
    public ResponseEntity<ApiResponse<Map<String, Object>>> detail(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable Long id,
            @RequestParam(defaultValue = "0") int cardPage,
            @RequestParam(defaultValue = "50") int cardSize) {
        if (cardSize > 100) cardSize = 100;
        User manager = getUser(principal);
        Deck d = service.getDeckDetail(manager, id);

        List<com.examprep.entities.Flashcard> allCards = flashcardRepository.findByDeckDeckIdOrderByPositionAscCardIdAsc(id);
        int start = Math.min(cardPage * cardSize, allCards.size());
        int end = Math.min(start + cardSize, allCards.size());
        Page<com.examprep.entities.Flashcard> cardPageResult = new PageImpl<>(allCards.subList(start, end), PageRequest.of(cardPage, cardSize), allCards.size());

        List<Map<String, Object>> cardsContent = cardPageResult.getContent().stream().map(f -> {
            Map<String, Object> cm = new HashMap<>();
            cm.put("cardId", f.getCardId());
            cm.put("position", f.getPosition() != null ? f.getPosition() : 0);
            cm.put("cardType", "TEXT");
            cm.put("frontText", f.getFrontText());
            cm.put("backText", f.getBackText());
            cm.put("codeLanguage", f.getCodeLanguage() != null ? f.getCodeLanguage() : null);
            cm.put("codeBody", f.getCodeBody() != null ? f.getCodeBody() : null);
            cm.put("frontImageUrl", null);
            cm.put("backImageUrl", null);
            cm.put("hint", null);
            return cm;
        }).toList();

        Map<String, Object> cardsObj = new HashMap<>();
        cardsObj.put("content", cardsContent);
        cardsObj.put("page", cardPageResult.getNumber());
        cardsObj.put("size", cardPageResult.getSize());
        cardsObj.put("totalElements", cardPageResult.getTotalElements());
        cardsObj.put("totalPages", cardPageResult.getTotalPages());
        cardsObj.put("first", cardPageResult.isFirst());
        cardsObj.put("last", cardPageResult.isLast());

        List<ReviewLog> logs = reviewLogRepository.findByTargetTypeAndTargetIdOrderByCreatedAtDesc("DECK", id);
        List<Map<String, Object>> history = logs.stream().map(l -> {
            Map<String, Object> hm = new HashMap<>();
            hm.put("decision", l.getDecision());
            hm.put("note", l.getNote() != null ? l.getNote() : "");
            hm.put("reviewer", Map.of("id", l.getReviewerId()));
            hm.put("createdAt", l.getCreatedAt());
            return hm;
        }).toList();

        boolean canReview = "PENDING".equalsIgnoreCase(d.getReviewStatus()) && !d.getUser().getUserId().equals(manager.getUserId());

        Map<String, Object> data = new HashMap<>();
        data.put("deckId", d.getDeckId());
        data.put("title", d.getTitle());
        data.put("description", d.getDescription() != null ? d.getDescription() : "");
        data.put("mode", d.getMode());
        data.put("owner", Map.of("id", d.getUser().getUserId(), "fullName", d.getUser().getFullName()));
        data.put("course", d.getCourse() != null ? Map.of("id", d.getCourse().getCourseId(), "title", d.getCourse().getTitle()) : Map.of());
        data.put("module", d.getModule() != null ? Map.of("id", d.getModule().getModuleId(), "title", d.getModule().getTitle()) : Map.of());
        data.put("reviewStatus", d.getReviewStatus());
        data.put("reviewNote", d.getReviewNote() != null ? d.getReviewNote() : "");
        data.put("resubmissionCount", d.getResubmissionCount() != null ? d.getResubmissionCount() : 0);
        data.put("submittedAt", d.getSubmittedAt() != null ? d.getSubmittedAt() : Instant.now());
        data.put("cardCount", flashcardRepository.countByDeckDeckId(id));
        data.put("history", history);
        data.put("cards", cardsObj);
        data.put("canReview", canReview);
        data.put("version", d.getVersion() != null ? d.getVersion() : 0L);

        return ResponseEntity.ok(ApiResponse.success(data));
    }

    @PostMapping("/{id}/approve")
    @Operation(summary = "Approve deck")
    public ResponseEntity<ApiResponse<Map<String, Object>>> approve(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable Long id,
            @RequestBody Map<String, Object> body) {
        User manager = getUser(principal);
        Long version = body.get("version") instanceof Number n ? n.longValue() : null;
        String note = (String) body.get("note");
        Map<String, Object> result = service.approve(manager, id, version, note);
        return ResponseEntity.ok(ApiResponse.success(result, "Đã duyệt bộ flashcard."));
    }

    @PostMapping("/{id}/reject")
    @Operation(summary = "Reject deck")
    public ResponseEntity<ApiResponse<Map<String, Object>>> reject(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable Long id,
            @RequestBody Map<String, Object> body) {
        User manager = getUser(principal);
        Long version = body.get("version") instanceof Number n ? n.longValue() : null;
        String reason = (String) body.get("reason");
        Map<String, Object> result = service.reject(manager, id, version, reason);
        return ResponseEntity.ok(ApiResponse.success(result, "Đã từ chối bộ flashcard."));
    }
}
