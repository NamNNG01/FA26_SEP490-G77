package com.examprep.services.manager.review;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import com.examprep.entities.Deck;
import com.examprep.entities.User;

import java.time.Instant;
import java.util.Map;

public interface DeckReviewService {
    Page<Deck> listDecks(User manager, Long courseId, Long moduleId, String status,
                         Long contributorId, String keyword, Instant submittedFrom, Instant submittedTo, Pageable pageable);

    Deck getDeckDetail(User manager, Long deckId);

    Map<String, Object> approve(User manager, Long deckId, Long requestVersion, String note);

    Map<String, Object> reject(User manager, Long deckId, Long requestVersion, String reason);
}
