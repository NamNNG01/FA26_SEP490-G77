package com.examprep.dto;

import jakarta.validation.constraints.*;

public final class DeckRequests {
    private DeckRequests() {}

    public record Create(@NotBlank @Size(max = 255)
                         @Pattern(regexp = "(?sU).*\\S.*", message = "must not be blank") String title,
                         @Positive Long courseId, @NotNull Boolean isPublic, String description) {}

    public record Update(@Size(max = 255)
                         @Pattern(regexp = "(?sU).*\\S.*", message = "must not be blank") String title,
                         @Positive Long courseId, Boolean isPublic, String description) {}

    /** F-06 body: both faces are required. */
    public record CardCreate(@NotBlank String frontText, @NotBlank String backText) {}
}
