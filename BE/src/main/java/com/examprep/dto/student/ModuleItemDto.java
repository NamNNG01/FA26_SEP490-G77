package com.examprep.dto.student;

/** CL-02 module: published exams and visible flashcard decks of the module. */
public record ModuleItemDto(Long moduleId, String title, Integer orderIndex, String description,
                            long examCount, long deckCount) {}
