package com.examprep.services.admin;

import com.examprep.dto.DeckResponse;
import com.examprep.dto.IdCount;
import com.examprep.dto.PageResponse;
import com.examprep.entities.Deck;
import com.examprep.entities.User;
import com.examprep.exceptions.BadRequestException;
import com.examprep.exceptions.ResourceNotFoundException;
import com.examprep.repositories.DeckRepository;
import com.examprep.repositories.FlashcardRepository;
import com.examprep.repositories.UserCardProgressRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class AdminCommunityDeckService {
    private final DeckRepository decks;
    private final FlashcardRepository cards;
    private final UserCardProgressRepository progress;

    public PageResponse<DeckResponse> list(String visibility, String reviewStatus, String search, int page, int size) {
        if (page < 0 || size < 1 || size > 100 || (long) page * size > Integer.MAX_VALUE) {
            throw new BadRequestException("Page must be nonnegative and size must be 1-100.");
        }
        String visFilter = normalizeFilter(visibility);
        String revFilter = normalizeFilter(reviewStatus);
        String text = search == null ? "" : search.strip().toLowerCase(Locale.ROOT);
        String pattern = "%" + text.replace("!", "!!").replace("%", "!%").replace("_", "!_") + "%";

        Page<Deck> result = decks.findAdminCommunityDecks(visFilter, revFilter, pattern, PageRequest.of(page, size));
        List<Long> ids = result.getContent().stream().map(Deck::getDeckId).toList();
        if (ids.isEmpty()) return PageResponse.of(result, List.of());

        Map<Long, Long> counts = cards.countByDecks(ids).stream()
                .collect(Collectors.toMap(IdCount::id, IdCount::total));
        return PageResponse.of(result, result.getContent().stream()
                .map(d -> toResponse(d, counts.getOrDefault(d.getDeckId(), 0L)))
                .toList());
    }

    @Transactional
    public DeckResponse hideDeck(Long deckId, String reason) {
        Deck deck = findStudentDeck(deckId);
        deck.setIsPublic(false);
        deck.setVisibility(Deck.VISIBILITY_PRIVATE);
        deck.setReviewStatus("REJECTED");
        deck.setReviewNote(reason != null && !reason.isBlank() ? reason.strip() : "Removed by administrator");
        decks.flush();
        long count = cards.countByDeckDeckId(deckId);
        return toResponse(deck, count);
    }

    @Transactional
    public void deleteDeck(Long deckId) {
        Deck deck = findStudentDeck(deckId);
        progress.deleteByDeck(deckId);
        cards.deleteByDeck(deckId);
        decks.delete(deck);
        decks.flush();
    }

    private Deck findStudentDeck(Long deckId) {
        Deck deck = decks.findDetail(deckId).orElseThrow(() -> new ResourceNotFoundException("Deck not found."));
        if (!User.ROLE_STUDENT.equals(deck.getUser().getRoleName())) {
            throw new BadRequestException("Only student community decks can be moderated here.");
        }
        return deck;
    }

    private static String normalizeFilter(String value) {
        if (value == null || value.isBlank() || "ALL".equalsIgnoreCase(value.strip())) return "";
        return value.strip().toUpperCase(Locale.ROOT);
    }

    private static DeckResponse toResponse(Deck d, long cardCount) {
        return new DeckResponse(
                d.getDeckId(),
                d.getTitle(),
                d.getCourse() == null ? null : d.getCourse().getCourseId(),
                d.getCourse() == null ? null : d.getCourse().getTitle(),
                d.getUser().getUserId(),
                d.getUser().getFullName(),
                Boolean.TRUE.equals(d.getIsPublic()),
                cardCount,
                d.getDescription(),
                null,
                d.getModule() == null ? null : d.getModule().getModuleId(),
                d.getModule() == null ? null : d.getModule().getTitle()
        );
    }
}
