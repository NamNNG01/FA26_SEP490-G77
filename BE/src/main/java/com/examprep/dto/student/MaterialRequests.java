package com.examprep.dto.student;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;

public final class MaterialRequests {
    private MaterialRequests() {}

    /** MQ-03 body: generate a quiz from one uploaded material, in one of its courses. */
    public record GenerateQuiz(
            @NotNull @Min(5) @Max(30) Integer questionCount,
            @Pattern(regexp = "EASY|MEDIUM|HARD") String difficulty,
            Long sourceLessonId,
            Long courseId) {
        public GenerateQuiz {
            if (difficulty == null || difficulty.isBlank()) {
                difficulty = "MEDIUM";
            }
        }
    }

    /** Attaches an existing material to another course of the student. */
    public record AttachCourse(@NotNull Long courseId) {}
}
