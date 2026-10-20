package com.examprep.dto;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

public record ExamResponse(Long examId, String title, String description,
        Long courseId, String courseName, Long moduleId, String moduleName, String examKind,
        int durationMinutes, int passMark, int maxAttempts, int questionCount, BigDecimal totalPoints,
        String status, String generationType, boolean isPractice, Instant createdAt,
        List<Config> configs, List<QuestionLink> questions, List<GroupLink> groups) {
    public record Config(Long configId, String questionType, int numberOfQuestions, Long moduleId, String difficulty) {}
    public record QuestionLink(Long examQuestionId, Long examId, Long questionId, String content, String questionType, BigDecimal points, int orderIndex, boolean hasRubric) {}
    public record GroupLink(Long examGroupId, Long examId, Long groupId, String title, BigDecimal points, int orderIndex,
            String passageText, int questionCount) {}
    public record Published(Long examId, String title, String status, int questionCount, List<String> warnings) {}
    public record Imported(int imported, int reused, int skippedDuplicates, List<Long> questionIds) {}
}
