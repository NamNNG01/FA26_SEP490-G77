package com.examprep.dto.student;

import com.fasterxml.jackson.annotation.JsonInclude;
import jakarta.validation.constraints.*;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

/** PQ-01..03 bodies. */
public final class PracticeDtos {
    private PracticeDtos() {}

    public record ModuleQuestionCount(@NotNull @Positive Long categoryId, @NotNull @Min(1) @Max(100) Integer questionCount) {}

    /** examType QUIZ (default, auto-graded types), ESSAY (assessment rubric types), or MIXED (balanced across all types). */
    public record Create(@NotNull @Positive Long courseId,
                         @Min(1) @Max(100) Integer questionCount,
                         @Min(1) @Max(180) Integer durationMinutes,
                         @Pattern(regexp = "QUIZ|ESSAY|MIXED") String examType,
                         @Size(max = 50) List<@NotNull @Positive Long> categoryIds,
                         @Pattern(regexp = "EASY|MEDIUM|HARD") String difficulty,
                         /** Name the student gives the exam; blank falls back to "Custom practice - <type>". */
                         @Size(max = 255) String title,
                         /** How the student takes it: EXAM (default, saved as PRACTICE_EXAM) or PRACTICE (saved as PRACTICE).
                          *  durationMinutes is required when mode is EXAM (or omitted); PRACTICE mode may omit it. */
                         @Pattern(regexp = "EXAM|PRACTICE") String mode,
                         @Size(max = 50) List<@NotNull @jakarta.validation.Valid ModuleQuestionCount> moduleQuestionCounts,
                         /** SMART: questionCount is spread over the modules by the student's weak spots (categoryIds and
                          *  moduleQuestionCounts are ignored); CUSTOM or null: as picked. */
                         @Pattern(regexp = "SMART|CUSTOM") String allocation,
                         /** SMART only: draw from this one module (0 = the course questions outside any module). */
                         @PositiveOrZero Long focusModuleId) {}

    /** One module of a SMART split; categoryId null = course questions outside any module. */
    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record PlanItem(Long categoryId, String name, int questionCount, int available, String mastery, int accuracy,
                           int answered, int stillWrong, int priority) {}

    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record Plan(int questionCount, List<PlanItem> modules) {}

    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record Created(Long practiceId, String title, int questionCount, Integer durationMinutes, Long examId) {}

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
