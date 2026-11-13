package com.examprep.dto;

import jakarta.validation.constraints.*;

public final class DeckRequests {
    private DeckRequests() {}

    public static final int CARD_TEXT_MAX = 5000;
    public static final int IMAGE_URL_MAX = 1000;

    /** Blank (no image) or an http(s) URL; blocks javascript:/data: values in an img src. */
    public static final String IMAGE_URL = "^\\s*$|^https?://\\S+$";

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

    /** F-06 body: each face needs nonblank text, an image URL, or both. */
    public record CardCreate(@Size(max = CARD_TEXT_MAX) String frontText,
                             @Size(max = CARD_TEXT_MAX) String backText,
                             @Size(max = IMAGE_URL_MAX) @Pattern(regexp = IMAGE_URL, message = "must be an http(s) URL") String frontImageUrl,
                             @Size(max = IMAGE_URL_MAX) @Pattern(regexp = IMAGE_URL, message = "must be an http(s) URL") String backImageUrl) {}

    /** F-07 body: an absent field keeps its stored value; an explicit null or blank clears it. */
    public record CardUpdate(@Size(max = CARD_TEXT_MAX) String frontText,
                             @Size(max = CARD_TEXT_MAX) String backText,
                             @Size(max = IMAGE_URL_MAX) @Pattern(regexp = IMAGE_URL, message = "must be an http(s) URL") String frontImageUrl,
                             @Size(max = IMAGE_URL_MAX) @Pattern(regexp = IMAGE_URL, message = "must be an http(s) URL") String backImageUrl) {}
}
