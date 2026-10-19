package com.examprep.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.util.List;
import java.util.Map;

public record ExamAiRequest(@NotNull @Positive Long courseId, @Positive Long moduleId, @Size(max = 255) String title,
        @NotNull @Min(1) @Max(50) Integer questionCount,
        @NotNull Map<String, Integer> difficultyDistribution,
        @NotEmpty List<@NotNull @Valid TypeCount> questionTypes,
        @Min(1) @Max(600) Integer durationMinutes, @Pattern(regexp = "vi|en") String language, Boolean useExistingBank) {
    public record TypeCount(@NotBlank String questionType, @NotNull @Min(1) @Max(50) Integer count) { }
}
