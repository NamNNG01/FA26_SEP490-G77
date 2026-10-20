package com.examprep.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.List;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record DeckResponse(Long deckId, String title, Long courseId, String courseName,
                           Long ownerId, String ownerName, Boolean isPublic, long cardCount,
                           String description, List<Card> cards) {
    public record Card(Long cardId, String frontText, String backText, boolean isStarred, String status) {}
}
