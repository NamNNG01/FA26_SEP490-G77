package com.examprep.dto.student;

import com.fasterxml.jackson.annotation.JsonInclude;
import jakarta.validation.constraints.*;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

/** PQ-01..03 bodies. */
public final class PracticeDtos {
    private PracticeDtos() {}

    /** categoryIds are module ids of the course (a course has one category; modules are its topics). */
    public record Create(@NotNull @Positive Long courseId,
                         @NotNull @Min(5) @Max(100) Integer questionCount,
                         @NotNull @Min(1) @Max(180) Integer durationMinutes,
                         @Pattern(regexp = "MIDTERM|FINAL") String examType,
                         @Size(max = 50) List<@NotNull @Positive Long> categoryIds,
                         @Pattern(regexp = "EASY|MEDIUM|HARD") String difficulty) {}

    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record Created(Long practiceId, String title, int questionCount, int durationMinutes, Long examId) {}

    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record Item(Long practiceId, Long examId, String title, Integer questionCount, Integer durationMinutes,
                       BigDecimal bestScore, Long attemptCount, Instant createdAt) {}
}
