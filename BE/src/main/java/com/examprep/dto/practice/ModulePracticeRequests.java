package com.examprep.dto.practice;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.databind.JsonNode;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

/**
 * Request bodies of the Module Practice APIs (MP-02, MP-05, MP-09).
 *
 * <p>{@code mode} is one of the two selection modes the feature actually implements:
 * {@code ALL} (the module's whole eligible pool, randomly ordered) or {@code REVIEW} (only the
 * questions {@code question_practice_progress} still marks as needing review).</p>
 */
public final class ModulePracticeRequests {

    private ModulePracticeRequests() {
    }

    /** Guard against a single practice run large enough to be unusable; a module holds far fewer. */
    public static final int MAX_QUESTION_COUNT = 500;
    public static final int MAX_TIME_SPENT_SECONDS = 24 * 3600;

    /**
     * MP-02. questionCount and mode are optional: no {@code questionCount} means "every eligible question of
     * the module"; no {@code mode} means {@code ALL}.
     * Modes: ALL, REVIEW, WRONG, BOOKMARKED, RANDOM, TARGET.
     * TARGET mode accepts optional difficulty and questionTypes.
     */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record StartSession(
            @Min(1) @Max(MAX_QUESTION_COUNT) Integer questionCount,
            @Pattern(regexp = "ALL|REVIEW|WRONG|BOOKMARKED|RANDOM|TARGET",
                     message = "mode must be ALL, REVIEW, WRONG, BOOKMARKED, RANDOM, or TARGET")
            String mode,
            @Pattern(regexp = "EASY|MEDIUM|HARD",
                     message = "difficulty must be EASY, MEDIUM, or HARD")
            String difficulty,
            java.util.List<String> questionTypes) {
    }

    /**
     * MP-05. {@code requestKey} is an optional client-generated key: replaying the same submit with
     * the same key returns the stored attempt instead of creating a second one.
     */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record SubmitAnswer(
            JsonNode response,
            @Min(0) @Max(MAX_TIME_SPENT_SECONDS) Integer timeSpentSeconds,
            @Size(max = 128) String requestKey) {
    }

    /**
     * MP-09. The answer to explain may be named directly, or left out to use the student's latest
     * attempt of that session question.
     */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Explanation(
            @Positive Long sessionId,
            @Positive Long sessionQuestionId,
            @Positive Long practiceAnswerId) {
    }
}
