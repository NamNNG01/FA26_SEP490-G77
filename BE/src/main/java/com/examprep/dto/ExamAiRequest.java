package com.examprep.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.util.List;
import java.util.Map;

public record ExamAiRequest(@NotNull @Positive Long courseId, @Positive Long moduleId, @Size(max = 255) String title,
        @NotNull @Min(1) @Max(50) Integer questionCount,
        @NotNull Map<String, Integer> difficultyDistribution,
        @NotEmpty List<@NotNull @Valid TypeCount> questionTypes,
        @Min(1) @Max(600) Integer durationMinutes, @Pattern(regexp = "vi|en") String language,
        // Course manager's own instructions (focus topics, learners, style); course/module data is added by the BE.
        @Size(max = 2000) String context) {
    public record TypeCount(@NotBlank String questionType, @NotNull @Min(1) @Max(50) Integer count) {
        // The FE exam AI tab sends MULTI_CHOICE; the question bank stores MULTIPLE_CHOICE.
        public TypeCount { if ("MULTI_CHOICE".equals(questionType)) questionType = "MULTIPLE_CHOICE"; }
    }
}
