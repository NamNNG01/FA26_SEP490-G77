package com.examprep.dto;

/** publicContentCount: active questions, published exams and public decks — what counts towards publishing the course. */
public record ModuleResponse(Long moduleId, Long courseId, String title, String description,
                             int orderIndex, String status, long questionCount, long examCount, long deckCount,
                             long publicContentCount) {}
