package com.examprep.dto.student;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.databind.DeserializationContext;
import com.fasterxml.jackson.databind.JsonDeserializer;
import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import jakarta.validation.constraints.*;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

/** Request/response bodies of FC-01..15, FP-01..03 and FV-01. */
public final class StudentDeckDtos {
    private StudentDeckDtos() {}

    public static final String MODES = "FLASHCARD|CODE_SNIPPET|CODE_OUTPUT";

    public record DeckCreate(@NotBlank @Size(max = 150) String title,
                             @Size(max = 500) String description,
                             @NotNull @Pattern(regexp = MODES) String mode,
                             @Positive Long courseId,
                             @Positive Long moduleId) {}

    /** Partial update: null leaves a field unchanged. */
    public record DeckUpdate(@Size(max = 150) @Pattern(regexp = "(?sU).*\\S.*", message = "must not be blank") String title,
                             @Size(max = 500) String description,
                             @Pattern(regexp = MODES) String mode,
                             @Positive Long courseId,
                             @PositiveOrZero Long moduleId) {}

    /** FC-04 / FC-05; which fields are required depends on the deck mode.
     *  Images (FLASHCARD decks only): field absent = keep, null = remove. */
    public record CardWrite(@Size(max = 5000) String frontText,
                            @Size(max = 5000) String backText,
                            String codeLanguage,
                            @Size(max = 20000) String codeBody,
                            @JsonDeserialize(using = Present.class)
                            Optional<@Size(max = 512) @Pattern(regexp = IMAGE_URL, message = "must be an http(s) URL") String> frontImageUrl,
                            @JsonDeserialize(using = Present.class)
                            Optional<@Size(max = 512) @Pattern(regexp = IMAGE_URL, message = "must be an http(s) URL") String> backImageUrl) {
        public CardWrite(String frontText, String backText, String codeLanguage, String codeBody) {
            this(frontText, backText, codeLanguage, codeBody, null, null);
        }
    }

    /** Field absent → null, JSON null → Optional.empty(), value → Optional.of(value). Jackson's own Optional
     *  deserializer gives empty for both, which would wipe an image on every partial FC-05 update. */
    public static final class Present extends JsonDeserializer<Optional<String>> {
        @Override public Optional<String> deserialize(JsonParser p, DeserializationContext ctxt) throws java.io.IOException {
            return Optional.ofNullable(p.getValueAsString());
        }
        @Override public Optional<String> getNullValue(DeserializationContext ctxt) { return Optional.empty(); }
        @Override public Object getAbsentValue(DeserializationContext ctxt) { return null; }
    }

    public static final String IMAGE_URL = "^\\s*$|^https?://\\S+$";

    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record DeckView(Long deckId, String title, String description, String mode, Long courseId, String courseTitle,
                           long cardCount, String visibility, String reviewStatus, String reviewNote, Instant createdAt,
                           Long moduleId, String moduleTitle) {}

    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record CardView(Long cardId, Long deckId, String frontText, String backText, String codeLanguage, String codeBody,
                           int position, String frontImageUrl, String backImageUrl) {}

    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record PublishRequestView(Long deckId, String visibility, String reviewStatus, Instant submittedAt) {}

    // ------------------------------------------------------------- progress and study (FC-08/09, FP, FV)

    public record ProgressWrite(@Pattern(regexp = "LEARNING|KNOWN|WRONG") String status, Boolean isStarred) {}

    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record ProgressView(Long cardId, String status, int wrongCount, boolean isStarred, boolean deckLearned,
                               long learnedCount, long totalCards) {}

    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record DeckLearnedView(Long deckId, long learnedCount, long totalCards, boolean deckLearned) {}

    public record SessionStart(@NotNull @Pattern(regexp = "PRACTICE|LEARN|VIEWER") String mode,
                               @Min(0) @Max(500) Integer cardLimit) {}

    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record StudyCard(Long cardId, String frontText, String backText, String codeLanguage, String codeBody,
                            String status, int wrongCount, boolean isStarred, String frontImageUrl, String backImageUrl) {}

    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record StudySessionView(String sessionId, Long deckId, String deckTitle, String deckMode, int totalCards,
                                   List<StudyCard> cards) {}

    public record SessionFinish(List<@NotNull Long> knownCardIds, List<@NotNull Long> wrongCardIds) {}

    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record SessionSummary(int totalCards, int knownCount, int wrongCount) {}

    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record ViewerCard(Long cardId, String frontText, String backText, String codeLanguage, String codeBody,
                             String frontImageUrl, String backImageUrl) {}

    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record ViewerView(Long deckId, String deckTitle, String deckMode, List<ViewerCard> cards) {}

    // ------------------------------------------------------------- FC-12

    public record FromQuestion(@NotNull @Positive Long questionId, @NotNull @Positive Long attemptId) {}

    // ------------------------------------------------------------- FC-13

    /** learnedCount / starredCount are the caller's own progress. */
    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record DeckListItem(Long deckId, String title, String description, String mode, Long courseId, String courseTitle,
                               Long ownerId, String ownerName, long cardCount, long learnedCount, long starredCount,
                               String visibility, String reviewStatus, Instant createdAt,
                               Long moduleId, String moduleTitle) {}

    // ------------------------------------------------------------- FC-14

    /** learnedCount / starredCount are the caller's own progress; reviewNote is only shown to the owner. */
    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record DeckDetail(Long deckId, String title, String description, String mode, Long courseId, String courseTitle,
                             Long ownerId, String ownerName, boolean isOwner, long cardCount, long learnedCount,
                             long starredCount, String visibility, String reviewStatus, String reviewNote,
                             Instant submittedAt, Instant createdAt,
                             Long moduleId, String moduleTitle) {}

    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record CardFromQuestionView(Long cardId, Long deckId, String frontText, String backText, int position,
                                       Long sourceQuestionId, Long sourceAttemptId) {}
}
