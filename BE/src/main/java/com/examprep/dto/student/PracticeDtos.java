package com.examprep.dto.student;

import com.fasterxml.jackson.annotation.JsonInclude;
import jakarta.validation.constraints.*;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

/** PQ-01..03 bodies. */
public final class PracticeDtos {
    private PracticeDtos() {}

    /** examType QUIZ (default, auto-graded types) or ESSAY (graded later through SE-02). categoryIds are module ids of the course (a course has one category; modules are its topics). */
    public record Create(@NotNull @Positive Long courseId,
                         @NotNull @Min(1) @Max(100) Integer questionCount,
                         @NotNull @Min(1) @Max(180) Integer durationMinutes,
                         @Pattern(regexp = "QUIZ|ESSAY") String examType,
                         @Size(max = 50) List<@NotNull @Positive Long> categoryIds,
                         @Pattern(regexp = "EASY|MEDIUM|HARD") String difficulty,
                         /** Name the student gives the exam; blank falls back to "Đề luyện tùy chọn - <type>". */
                         @Size(max = 255) String title) {}

    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record Created(Long practiceId, String title, int questionCount, int durationMinutes, Long examId) {}

    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record Item(Long practiceId, Long examId, String title, Integer questionCount, Integer durationMinutes,
                       BigDecimal bestScore, Long attemptCount, Instant createdAt,
                       String examType, String difficulty, List<Long> moduleIds) {
        public Item(Long practiceId, Long examId, String title, Integer questionCount, Integer durationMinutes,
                    BigDecimal bestScore, Long attemptCount, Instant createdAt) {
            this(practiceId, examId, title, questionCount, durationMinutes, bestScore, attemptCount, createdAt, null, null, null);
        }
    }
}
