package com.examprep.dto;

import jakarta.validation.constraints.*;
import java.math.BigDecimal;

public final class CourseRequests {
    private CourseRequests() {}

    public record Create(@NotBlank @Size(max = 255) @Pattern(regexp = "(?sU).*\\S.*", message = "must not be blank") String title,
                         @NotNull @Positive Long categoryId,
                         @NotNull @Positive Long managerId,
                         String description, @Size(max = 512) String thumbnailUrl,
                         @DecimalMin("0") @DecimalMax("99999999.99") @Digits(integer = 8, fraction = 2) BigDecimal price) {}

    public record Update(@Size(max = 255) @Pattern(regexp = "(?sU).*\\S.*", message = "must not be blank") String title,
                         @Positive Long categoryId, String description,
                         @Size(max = 512) String thumbnailUrl, BigDecimal price, Long managerId) {}

    public record Publish(@NotNull Boolean isPublished) {}

    public record CreateModule(@NotBlank @Size(max = 255) @Pattern(regexp = "(?sU).*\\S.*", message = "must not be blank") String title,
                               String description, @Positive Integer orderIndex) {}

    public record UpdateModule(@Size(max = 255) @Pattern(regexp = "(?sU).*\\S.*", message = "must not be blank") String title,
                               String description, @Positive Integer orderIndex) {}
}
