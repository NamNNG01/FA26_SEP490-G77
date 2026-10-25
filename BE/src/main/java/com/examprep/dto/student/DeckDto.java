package com.examprep.dto.student;

public record DeckDto(
        Long deckId,
        String title,
        String description,
        Boolean isPublic,
        Long cardCount,
        Long learnedCount,
        Long starredCount
) {}
