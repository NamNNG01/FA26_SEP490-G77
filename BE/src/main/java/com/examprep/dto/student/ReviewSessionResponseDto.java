package com.examprep.dto.student;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ReviewSessionResponseDto {
    private Long examId;
    private Long attemptId;
    private String examType;
    private String title;
    private BigDecimal maxScore;
    private Integer durationMinutes;
    private List<ReviewQuestionDto> questions;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ReviewQuestionDto {
        private Long questionId;
        private int orderIndex;
        private String questionType;
        private String content;
        private List<OptionDto> options;
        private BigDecimal maxPoints;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class OptionDto {
        private Long optionId;
        private String optionText;
    }
}
