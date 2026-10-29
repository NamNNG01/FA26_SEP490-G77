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
                               @Min(10) @Max(60) Integer durationMinutes) {}

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

    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record Mistake(String pattern, int frequency, String suggestion) {}

    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record CategoryBreakdown(Long categoryId, String name, int totalQuestions, int correctCount, int accuracy, String trend,
                                    List<Mistake> commonMistakes) {}

    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record TypeBreakdown(String questionType, int accuracy, String trend) {}

    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record WeaknessReport(Instant generatedAt, String source, Long courseId, String period, String summary,
                                 List<CategoryBreakdown> categoryBreakdown, List<TypeBreakdown> questionTypeBreakdown,
                                 List<String> actionPlan, StudentAiResponse.QuotaLeft quota) {}
}
