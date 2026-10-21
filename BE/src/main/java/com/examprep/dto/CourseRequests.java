package com.examprep.dto;

import jakarta.validation.constraints.*;
import java.math.BigDecimal;
import java.util.List;

public final class CourseRequests {
    private CourseRequests() {}

    // managerId is the primary manager; managerIds are optional co-managers stored only in course_managers.
    public record Create(@NotBlank @Size(max = 255) @Pattern(regexp = "(?sU).*\\S.*", message = "must not be blank") String title,
                         @NotNull @Positive Long categoryId,
                         @NotNull @Positive Long managerId,
                         @Size(max = 20) List<@NotNull @Positive Long> managerIds,
                         String description, @Size(max = 512) String thumbnailUrl,
                         @DecimalMin("0") @DecimalMax("99999999.99") @Digits(integer = 8, fraction = 2) BigDecimal price) {}

    // managerIds (Admin only) replaces the whole co-manager list; [] removes all co-managers.
    public record Update(@Size(max = 255) @Pattern(regexp = "(?sU).*\\S.*", message = "must not be blank") String title,
                         @Positive Long categoryId, String description,
                         @Size(max = 512) String thumbnailUrl, BigDecimal price, Long managerId,
                         @Size(max = 20) List<@NotNull @Positive Long> managerIds) {}

    public record Publish(@NotNull Boolean isPublished) {}

    public record CreateModule(@NotBlank @Size(max = 255) @Pattern(regexp = "(?sU).*\\S.*", message = "must not be blank") String title,
                               String description, @Positive Integer orderIndex) {}

    public record ModuleStatus(@NotBlank @Pattern(regexp = "VISIBLE|HIDDEN", message = "must be VISIBLE or HIDDEN") String status) {}

    public record UpdateModule(@Size(max = 255) @Pattern(regexp = "(?sU).*\\S.*", message = "must not be blank") String title,
                               String description, @Positive Integer orderIndex) {}
}
