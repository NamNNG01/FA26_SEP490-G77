package com.examprep.dto.student;

public record CourseStatsDto(Long publishedExamCount, Long deckCount, Long questionCount) {
    public CourseStatsDto(Long publishedExamCount, Long deckCount) {
        this(publishedExamCount, deckCount, 0L);
    }
}
