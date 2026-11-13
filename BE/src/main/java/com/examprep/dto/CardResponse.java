package com.examprep.dto;

import com.examprep.entities.Flashcard;
import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * F-06 / F-07 / F-08: a single flashcard as returned by the card endpoints.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.ALWAYS)
public class CardResponse {

    private Long cardId;
    private Long deckId;
    private String frontText;
    private String backText;
    private String frontImageUrl;
    private String backImageUrl;

    public static CardResponse from(Flashcard card) {
        return CardResponse.builder()
                .cardId(card.getCardId())
                .deckId(card.getDeck().getDeckId())
                .frontText(card.getFrontText())
                .backText(card.getBackText())
                .frontImageUrl(card.getFrontImageUrl())
                .backImageUrl(card.getBackImageUrl())
                .build();
    }
}
