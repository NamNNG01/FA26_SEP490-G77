package com.examprep.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.math.BigDecimal;
import java.util.List;

public final class ExamRequests {
    private ExamRequests() {}
    public record QuestionLink(@NotNull @Positive Long questionId,
            @DecimalMin(value="0", inclusive=false) @Digits(integer=3, fraction=2) BigDecimal points,
            @PositiveOrZero Integer orderIndex) {}
    public record GroupLink(@NotNull @Positive Long groupId,
            @DecimalMin(value="0", inclusive=false) @Digits(integer=3, fraction=2) BigDecimal points,
            @PositiveOrZero Integer orderIndex) {}
    public record Config(@NotBlank String questionType, @NotNull @Min(1) @Max(500) Integer numberOfQuestions,
            @Positive Long moduleId, @Pattern(regexp="EASY|MEDIUM|HARD") String difficulty) {}
    public record Create(@NotBlank @Size(max=255) @Pattern(regexp="(?sU).*\\S.*") String title,
            String description, @Positive Long courseId, @Positive Long moduleId,
            @NotNull @Min(1) @Max(600) Integer durationMinutes, @NotNull Boolean isPractice,
            @NotNull @Pattern(regexp="STATIC|RANDOM|MIXED") String generationType,
            @Min(0) @Max(100) Integer passMark, @Min(1) Integer maxAttempts,
            @Size(max=500) List<@Valid QuestionLink> questionIds,
            @Size(max=100) List<@Valid Config> configs, @Size(max=100) List<@Valid GroupLink> groupIds) {}
    public record Update(@Size(max=255) @Pattern(regexp="(?sU).*\\S.*") String title,
            String description, @Positive Long courseId, @Positive Long moduleId,
            @Min(1) @Max(600) Integer durationMinutes, Boolean isPractice,
            @Pattern(regexp="STATIC|RANDOM|MIXED") String generationType,
            @Min(0) @Max(100) Integer passMark, @Min(1) Integer maxAttempts,
            @Size(max=100) List<@Valid Config> configs) {}
    public record Publish(@NotNull @Pattern(regexp="DRAFT|PUBLISHED|ARCHIVED") String status) {}
    public record Criterion(@NotBlank @Size(max=255) String name,
            @NotNull @DecimalMin(value="0",inclusive=false) BigDecimal maxScore,
            @NotNull @DecimalMin("0") @DecimalMax("100") BigDecimal weight, String descriptors) {}
    public record Rubric(@NotEmpty @Size(max=100) List<@Valid Criterion> criteria,
            @DecimalMin(value="0",inclusive=false) BigDecimal totalPoints, String notes) {}
}
