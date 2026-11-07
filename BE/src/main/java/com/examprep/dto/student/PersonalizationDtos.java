package com.examprep.dto.student;

import com.examprep.dto.StudentAiResponse;
import com.fasterxml.jackson.annotation.JsonInclude;
import jakarta.validation.constraints.*;

import java.time.Instant;
import java.util.List;

/** AI-01..04 bodies. "category" fields carry module ids/titles (a course has one category; modules are its topics). */
public final class PersonalizationDtos {
    private PersonalizationDtos() {}

    public record SmartRequest(@NotNull @Positive Long courseId,
                               @Min(10) @Max(30) Integer questionCount,
                               @Min(10) @Max(60) Integer durationMinutes,
                               @Size(max = 2000) String context,
                               /** Name the student gives the exam; blank falls back to "Đề luyện thông minh". */
                               @Size(max = 255) String title) {}

    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record CategoryAccuracy(Long categoryId, String name, int accuracy, int questionCount) {}

    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record Analysis(int totalAttempts, List<CategoryAccuracy> weakCategories, List<CategoryAccuracy> strongCategories) {}

    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record SmartStarted(String jobId, String status, Analysis analysis) {}

    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record SmartStatus(String jobId, String status, Long examId, Integer questionCount, List<String> focusAreas,
                              String estimatedDifficulty) {}

    // ------------------------------------------------------------- AI-03

    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record Strength(Long categoryId, String name, int accuracy, String trend) {}

    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record Weakness(Long categoryId, String name, int accuracy, String trend, String priority) {}

    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record Recommendation(String type, Long refId, String title, String reason, String priority) {}

    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record Recommendations(Instant generatedAt, String source, Long courseId, int overallReadiness,
                                  List<Strength> strengths, List<Weakness> weaknesses, List<Recommendation> recommendations,
                                  String message, StudentAiResponse.QuotaLeft quota) {}

    // ------------------------------------------------------------- AI-04

    public record WeaknessRequest(@NotNull @Positive Long courseId,
                                  @Pattern(regexp = "LAST_7_DAYS|LAST_30_DAYS|ALL_TIME") String period) {}

    /**
     * frequency = how many of the analysed wrong answers (questionIds) show the pattern. refType DECK / EXAM / MODULE with
     * refId/refTitle is the course resource the suggestion points to, checked to exist; all three null when none fits.
     */
    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record Mistake(String pattern, int frequency, String suggestion, List<Long> questionIds,
                          String refType, Long refId, String refTitle) {}

    /** totalQuestions/correctCount count distinct questions by their latest answer; enoughData = at least 3 of them. */
    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record CategoryBreakdown(Long categoryId, String name, int totalQuestions, int correctCount, int accuracy, String trend,
                                    boolean enoughData, List<Mistake> commonMistakes) {}

    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record TypeBreakdown(String questionType, int accuracy, String trend) {}

    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record DifficultyBreakdown(String difficulty, int accuracy, int questionCount, String trend) {}

    /** A module with live questions the student has not answered in the period. */
    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record Topic(Long categoryId, String name) {}

    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record WeaknessReport(Instant generatedAt, String source, Long courseId, String period, String summary,
                                 List<CategoryBreakdown> categoryBreakdown, List<TypeBreakdown> questionTypeBreakdown,
                                 List<DifficultyBreakdown> difficultyBreakdown, List<Topic> notPracticedCategories,
                                 List<String> actionPlan, StudentAiResponse.QuotaLeft quota) {}
}
