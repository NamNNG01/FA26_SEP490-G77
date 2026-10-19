package com.examprep.dto.exam;

import com.examprep.dto.question.AnswerOptionDto;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ExamResponse {
    private Long examId;
    private Long courseId;
    private String courseName;
    private Long moduleId;
    private String title;
    private String description;
    private Integer durationMinutes;
    private Boolean isPractice;
    private String generationType;
    private String status;
    private Instant publishedAt;
    private Integer passMark;
    private Integer maxAttempts;
    private Long createdBy;
    private Instant createdAt;
    private List<ExamQuestionDto> questions;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ExamQuestionDto {
        private Long examQuestionId;
        private Long questionId;
        private String content;
        private String questionType;
        private String difficulty;
        private Integer orderIndex;
        private BigDecimal points;
        private List<AnswerOptionDto> options;
        private Object answerKey; // omitted for students during attempt
        private String aiExplanation; // omitted for students during attempt
    }
}
