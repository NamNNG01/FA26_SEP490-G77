package com.examprep.dto.student;

public record CardDto(
        Long cardId,
        String frontText,
        String backText,
        String status,
        Boolean isStarred
) {}
