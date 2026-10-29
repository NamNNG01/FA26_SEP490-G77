package com.examprep.dto.student;

import jakarta.validation.constraints.*;

import java.time.Instant;
import java.util.List;

/** Request/response bodies of FC-01..12, FP-01..03 and FV-01. */
public final class StudentDeckDtos {
    private StudentDeckDtos() {}

    public static final String MODES = "FLASHCARD|CODE_SNIPPET|CODE_OUTPUT";

    public record DeckCreate(@NotBlank @Size(max = 150) String title,
                             @Size(max = 500) String description,
                             @NotNull @Pattern(regexp = MODES) String mode,
                             @Positive Long courseId) {}

    /** Partial update: null leaves a field unchanged. */
    public record DeckUpdate(@Size(max = 150) @Pattern(regexp = "(?sU).*\\S.*", message = "must not be blank") String title,
                             @Size(max = 500) String description,
                             @Pattern(regexp = MODES) String mode,
                             @Positive Long courseId) {}

    /** FC-04 / FC-05; which fields are required depends on the deck mode. */
    public record CardWrite(@Size(max = 5000) String frontText,
                            @Size(max = 5000) String backText,
                            String codeLanguage,
                            @Size(max = 20000) String codeBody) {}

    public record DeckView(Long deckId, String title, String description, String mode, Long courseId, long cardCount,
                           String visibility, String reviewStatus, String reviewNote, Instant createdAt) {}

    public record CardView(Long cardId, Long deckId, String frontText, String backText, String codeLanguage, String codeBody,
                           int position) {}

    public record PublishRequestView(Long deckId, String visibility, String reviewStatus, Instant submittedAt) {}

    // ------------------------------------------------------------- progress and study (FC-08/09, FP, FV)

    public record ProgressWrite(@Pattern(regexp = "LEARNING|KNOWN|WRONG") String status, Boolean isStarred) {}

    public record ProgressView(Long cardId, String status, int wrongCount, boolean isStarred, boolean deckLearned,
                               long learnedCount, long totalCards) {}

    public record DeckLearnedView(Long deckId, long learnedCount, long totalCards, boolean deckLearned) {}

    public record SessionStart(@NotNull @Pattern(regexp = "PRACTICE|LEARN|VIEWER") String mode,
                               @Min(0) @Max(500) Integer cardLimit) {}

    public record StudyCard(Long cardId, String frontText, String backText, String codeLanguage, String codeBody,
                            String status, int wrongCount, boolean isStarred) {}

    public record StudySessionView(String sessionId, Long deckId, String deckTitle, String deckMode, int totalCards,
                                   List<StudyCard> cards) {}

    public record SessionFinish(List<@NotNull Long> knownCardIds, List<@NotNull Long> wrongCardIds) {}

    public record SessionSummary(int totalCards, int knownCount, int wrongCount) {}

    public record ViewerCard(Long cardId, String frontText, String backText, String codeLanguage, String codeBody) {}

    public record ViewerView(Long deckId, String deckTitle, String deckMode, List<ViewerCard> cards) {}

    // ------------------------------------------------------------- FC-12

    public record FromQuestion(@NotNull @Positive Long questionId, @NotNull @Positive Long attemptId) {}

    public record CardFromQuestionView(Long cardId, Long deckId, String frontText, String backText, int position,
                                       Long sourceQuestionId, Long sourceAttemptId) {}
}
