package com.examprep.services.manager.review;

import com.examprep.dto.IdCount;
import com.examprep.entities.*;
import com.examprep.exceptions.ReviewException;
import com.examprep.repositories.*;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class DeckReviewServiceImpl implements DeckReviewService {

    private final DeckRepository deckRepository;
    private final CourseRepository courseRepository;
    private final FlashcardRepository flashcardRepository;
    private final ReviewLogRepository reviewLogRepository;
    private final ReviewNotificationService reviewNotificationService;

    private List<Long> getMyCourseIds(User manager) {
        if (manager == null) return List.of();
        if (User.ROLE_ADMIN.equals(manager.getRoleName())) {
            return null;
        }
        return courseRepository.findCourseIdsManagedByUser(manager.getUserId());
    }

    private void assertCanAccessCourse(User manager, Long courseId) {
        if (User.ROLE_ADMIN.equals(manager.getRoleName())) {
            return;
        }
        boolean hasAccess = courseRepository.existsManagedCourse(courseId, manager.getUserId());
        if (!hasAccess) {
            throw new ReviewException(HttpStatus.NOT_FOUND, "RESOURCE_NOT_FOUND", null, "Course not found or outside scope");
        }
    }

    @Override
    @Transactional(readOnly = true)
    public Page<Deck> listDecks(User manager, Long courseId, Long moduleId, String status,
                                Long contributorId, String keyword, Instant submittedFrom, Instant submittedTo, Pageable pageable) {
        List<Long> myCourseIds = getMyCourseIds(manager);
        if (myCourseIds != null && myCourseIds.isEmpty()) {
            return Page.empty(pageable);
        }
        if (courseId != null) {
            assertCanAccessCourse(manager, courseId);
            myCourseIds = List.of(courseId);
        }

        String normStatus = (status == null || status.isBlank()) ? "PENDING_REVIEW" : status.toUpperCase();
        if ("ALL".equals(normStatus)) {
            normStatus = null;
        } else if ("PENDING".equals(normStatus)) {
            normStatus = "PENDING_REVIEW";
        } else if ("ACCEPTED".equals(normStatus)) {
            normStatus = "APPROVED";
        }

        String kwPattern = (keyword == null || keyword.isBlank()) ? null : "%" + keyword.strip().toLowerCase()
                .replace("!", "!!").replace("%", "!%").replace("_", "!_") + "%";

        return deckRepository.findManagedReviewDecks(myCourseIds, moduleId, normStatus, contributorId, kwPattern, submittedFrom, submittedTo, pageable);
    }

    @Override
    @Transactional(readOnly = true)
    public Map<String, Object> listContributedDecks(User manager, Long courseId, Long moduleId, String status,
                                                    Long contributorId, String keyword, Instant submittedFrom,
                                                    Instant submittedTo, int page, int size, String sort) {
        if (page < 0 || size < 1) {
            throw new ReviewException(HttpStatus.UNPROCESSABLE_ENTITY, "VALIDATION_ERROR", null,
                    "page must be nonnegative and size must be positive.");
        }
        if (size > 100) size = 100;
        String[] sortParts = sort == null ? new String[0] : sort.split(",");
        String sortField = sortParts.length > 0 && !sortParts[0].isBlank() ? sortParts[0] : "submittedAt";
        Sort.Direction direction = sortParts.length > 1 && "desc".equalsIgnoreCase(sortParts[1])
                ? Sort.Direction.DESC : Sort.Direction.ASC;
        Pageable pageable = PageRequest.of(page, size, Sort.by(direction, sortField));

        Page<Deck> pageResult = listDecks(manager, courseId, moduleId, status, contributorId, keyword,
                submittedFrom, submittedTo, pageable);
        List<Long> deckIds = pageResult.getContent().stream().map(Deck::getDeckId).toList();
        Map<Long, Long> cardCounts = deckIds.isEmpty() ? Map.of()
                : flashcardRepository.countByDecks(deckIds).stream()
                        .collect(Collectors.toMap(IdCount::id, IdCount::total));

        List<Map<String, Object>> content = pageResult.getContent().stream().map(d -> {
            boolean canReview = "PENDING_REVIEW".equalsIgnoreCase(d.getReviewStatus())
                    && !d.getUser().getUserId().equals(manager.getUserId());
            Map<String, Object> map = new HashMap<>();
            map.put("deckId", d.getDeckId());
            map.put("title", d.getTitle());
            map.put("description", d.getDescription() != null ? d.getDescription() : "");
            map.put("cardCount", cardCounts.getOrDefault(d.getDeckId(), 0L));
            map.put("owner", Map.of("id", d.getUser().getUserId(), "fullName", d.getUser().getFullName()));
            map.put("course", d.getCourse() != null
                    ? Map.of("id", d.getCourse().getCourseId(), "title", d.getCourse().getTitle()) : Map.of());
            map.put("module", d.getModule() != null
                    ? Map.of("id", d.getModule().getModuleId(), "title", d.getModule().getTitle()) : Map.of());
            map.put("reviewStatus", d.getReviewStatus());
            map.put("resubmissionCount", d.getResubmissionCount() != null ? d.getResubmissionCount() : 0);
            map.put("submittedAt", d.getSubmittedAt() != null ? d.getSubmittedAt() : Instant.now());
            map.put("reviewedAt", d.getUpdatedAt() != null ? d.getUpdatedAt() : null);
            map.put("version", d.getVersion() != null ? d.getVersion() : 0L);
            map.put("canReview", canReview);
            return map;
        }).toList();

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("content", content);
        data.put("page", pageResult.getNumber());
        data.put("size", pageResult.getSize());
        data.put("totalElements", pageResult.getTotalElements());
        data.put("totalPages", pageResult.getTotalPages());
        data.put("first", pageResult.isFirst());
        data.put("last", pageResult.isLast());
        return data;
    }

    @Override
    @Transactional(readOnly = true)
    public Deck getDeckDetail(User manager, Long deckId) {
        Deck deck = deckRepository.findDetail(deckId)
                .orElseThrow(() -> new ReviewException(HttpStatus.NOT_FOUND, "RESOURCE_NOT_FOUND", null, "Deck not found"));
        if (deck.getCourse() == null || deck.getSubmittedAt() == null
                || !User.ROLE_STUDENT.equals(deck.getUser().getRoleName())) {
            throw new ReviewException(HttpStatus.NOT_FOUND, "RESOURCE_NOT_FOUND", null, "Deck not found");
        }
        assertCanAccessCourse(manager, deck.getCourse().getCourseId());
        return deck;
    }

    @Override
    @Transactional
    public Map<String, Object> approve(User manager, Long deckId, Long requestVersion, String note) {
        Deck deck = deckRepository.findForUpdate(deckId)
                .orElseThrow(() -> new ReviewException(HttpStatus.NOT_FOUND, "RESOURCE_NOT_FOUND", null, "Deck not found"));
        if (deck.getCourse() == null || deck.getSubmittedAt() == null
                || !User.ROLE_STUDENT.equals(deck.getUser().getRoleName())) {
            throw new ReviewException(HttpStatus.NOT_FOUND, "RESOURCE_NOT_FOUND", null, "Deck not found");
        }
        assertCanAccessCourse(manager, deck.getCourse().getCourseId());

        if (deck.getUser().getUserId().equals(manager.getUserId())) {
            throw new ReviewException(HttpStatus.FORBIDDEN, "FORBIDDEN", "CANNOT_REVIEW_OWN", "Cannot review your own deck");
        }
        if (!"PENDING_REVIEW".equals(deck.getReviewStatus())) {
            throw new ReviewException(HttpStatus.CONFLICT, "RESOURCE_CONFLICT", "ALREADY_REVIEWED", "Deck already reviewed", Map.of("currentStatus", deck.getReviewStatus()));
        }
        if (requestVersion == null || !requestVersion.equals(deck.getVersion())) {
            throw new ReviewException(HttpStatus.CONFLICT, "RESOURCE_CONFLICT", "VERSION_CONFLICT", "Version mismatch", Map.of("currentVersion", deck.getVersion(), "currentStatus", deck.getReviewStatus()));
        }

        long cardCount = flashcardRepository.countByDeckDeckId(deckId);
        if (cardCount <= 0) {
            throw new ReviewException(HttpStatus.UNPROCESSABLE_ENTITY, "VALIDATION_ERROR", "DECK_EMPTY", "Deck cannot be empty");
        }

        deck.setReviewStatus("APPROVED");
        deck.setVisibility(Deck.VISIBILITY_PUBLIC);
        deck.setIsPublic(true);
        deck.setReviewNote(note);
        Deck savedDeck = deckRepository.save(deck);

        ReviewLog log = ReviewLog.builder()
                .targetType("DECK")
                .targetId(deckId)
                .reviewerId(manager.getUserId())
                .decision("APPROVED")
                .note(note)
                .build();
        reviewLogRepository.save(log);

        String title = "Bộ flashcard đã được duyệt";
        String courseTitle = deck.getCourse() == null ? "kho flashcard" : deck.getCourse().getTitle();
        String content = "Bộ \"" + deck.getTitle() + "\" đã được duyệt cho \"" + courseTitle + "\".";
        reviewNotificationService.sendNotification(deck.getUser().getUserId(), title, content, "DECK_APPROVED", "DECK", String.valueOf(deckId), "/decks/" + deckId);

        return Map.of(
                "deckId", savedDeck.getDeckId(),
                "reviewStatus", savedDeck.getReviewStatus(),
                "visibility", savedDeck.getVisibility(),
                "isPublic", savedDeck.getIsPublic(),
                "reviewedBy", manager.getUserId(),
                "reviewedAt", Instant.now(),
                "version", savedDeck.getVersion()
        );
    }

    @Override
    @Transactional
    public Map<String, Object> reject(User manager, Long deckId, Long requestVersion, String reason) {
        if (reason == null || reason.strip().length() < 5) {
            throw new ReviewException(HttpStatus.UNPROCESSABLE_ENTITY, "VALIDATION_ERROR", "REASON_REQUIRED", "Reason is required (at least 5 characters)");
        }

        Deck deck = deckRepository.findForUpdate(deckId)
                .orElseThrow(() -> new ReviewException(HttpStatus.NOT_FOUND, "RESOURCE_NOT_FOUND", null, "Deck not found"));
        if (deck.getCourse() == null || deck.getSubmittedAt() == null
                || !User.ROLE_STUDENT.equals(deck.getUser().getRoleName())) {
            throw new ReviewException(HttpStatus.NOT_FOUND, "RESOURCE_NOT_FOUND", null, "Deck not found");
        }
        assertCanAccessCourse(manager, deck.getCourse().getCourseId());

        if (deck.getUser().getUserId().equals(manager.getUserId())) {
            throw new ReviewException(HttpStatus.FORBIDDEN, "FORBIDDEN", "CANNOT_REVIEW_OWN", "Cannot review your own deck");
        }
        if (!"PENDING_REVIEW".equals(deck.getReviewStatus())) {
            throw new ReviewException(HttpStatus.CONFLICT, "RESOURCE_CONFLICT", "ALREADY_REVIEWED", "Deck already reviewed", Map.of("currentStatus", deck.getReviewStatus()));
        }
        if (requestVersion == null || !requestVersion.equals(deck.getVersion())) {
            throw new ReviewException(HttpStatus.CONFLICT, "RESOURCE_CONFLICT", "VERSION_CONFLICT", "Version mismatch", Map.of("currentVersion", deck.getVersion(), "currentStatus", deck.getReviewStatus()));
        }

        deck.setReviewStatus("REJECTED");
        deck.setVisibility(Deck.VISIBILITY_PRIVATE);
        deck.setIsPublic(false);
        deck.setReviewNote(reason.strip());
        Deck savedDeck = deckRepository.save(deck);

        ReviewLog log = ReviewLog.builder()
                .targetType("DECK")
                .targetId(deckId)
                .reviewerId(manager.getUserId())
                .decision("REJECTED")
                .note(reason.strip())
                .build();
        reviewLogRepository.save(log);

        boolean canResubmit = (deck.getResubmissionCount() < 1);
        String title = "Bộ flashcard chưa được duyệt";
        String content = "Bộ \"" + deck.getTitle() + "\" bị từ chối. Lý do: " + reason.strip();
        reviewNotificationService.sendNotification(deck.getUser().getUserId(), title, content, "DECK_REJECTED", "DECK", String.valueOf(deckId), "/decks/" + deckId);

        return Map.of(
                "deckId", savedDeck.getDeckId(),
                "reviewStatus", savedDeck.getReviewStatus(),
                "visibility", savedDeck.getVisibility(),
                "isPublic", savedDeck.getIsPublic(),
                "canResubmit", canResubmit,
                "reviewedBy", manager.getUserId(),
                "reviewedAt", Instant.now(),
                "version", savedDeck.getVersion()
        );
    }
}
