package com.examprep.dto;

import jakarta.validation.constraints.*;

public final class DeckRequests {
    private DeckRequests() {}

    public record Create(@NotBlank @Size(max = 255)
                         @Pattern(regexp = "(?sU).*\\S.*", message = "must not be blank") String title,
                         @Positive Long courseId, @NotNull Boolean isPublic, String description,
                         /** Optional module of courseId (V60). */
                         @Positive Long moduleId) {}

    public record Update(@Size(max = 255)
                         @Pattern(regexp = "(?sU).*\\S.*", message = "must not be blank") String title,
                         @Positive Long courseId, Boolean isPublic, String description,
                         /** null = unchanged, 0 = no module, otherwise a module of the deck's course (V60). */
                         @PositiveOrZero Long moduleId) {}

    /** F-06 body: both faces are required. */
    public record CardCreate(@NotBlank String frontText, @NotBlank String backText) {}

    /** F-07 body: partial update; null or blank means "leave this face unchanged". */
    public record CardUpdate(String frontText, String backText) {}
}
