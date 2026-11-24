package com.examprep.dto.student;

/** CL-02 module: published exams, visible flashcard decks, and public practice questions of the module. */
public record ModuleItemDto(Long moduleId, String title, Integer orderIndex, String description,
                            long examCount, long deckCount, long questionCount) {
    public ModuleItemDto(Long moduleId, String title, Integer orderIndex, String description,
                         long examCount, long deckCount) {
        this(moduleId, title, orderIndex, description, examCount, deckCount, 0L);
    }
}
