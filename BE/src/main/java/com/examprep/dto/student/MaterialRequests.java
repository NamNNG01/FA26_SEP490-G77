package com.examprep.dto.student;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public final class MaterialRequests {
    private MaterialRequests() {}

    /** MQ-03 body: generate a quiz from one uploaded material, in one of its courses. */
    public record GenerateQuiz(
            @NotNull @Min(5) @Max(30) Integer questionCount,
            @Pattern(regexp = "EASY|MEDIUM|HARD") String difficulty,
            Long sourceLessonId,
            Long courseId,
            /** Name the student gives the quiz; blank falls back to "Quiz từ tài liệu <material>". */
            @Size(max = 255) String title,
            /** Free-text guidance for the AI (focus topics, question style). */
            @Size(max = 2000) String context,
            @Min(1) @Max(180) Integer durationMinutes) {
        public GenerateQuiz {
            if (difficulty == null || difficulty.isBlank()) {
                difficulty = "MEDIUM";
            }
        }
    }

    public record StartQuiz(@Pattern(regexp = "EXAM|PRACTICE") String takeAs) {}

    /** Attaches an existing material to another course of the student. */
    public record AttachCourse(@NotNull Long courseId) {}
}
