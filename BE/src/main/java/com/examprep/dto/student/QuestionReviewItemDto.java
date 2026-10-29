package com.examprep.dto.student;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;
import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class QuestionReviewItemDto {
    private Long reviewId;
    private Long questionId;
    private boolean isWrong;
    private boolean isBookmarked;
    private String questionText;
    private String questionType;
    private List<OptionDto> options;
    private List<Long> correctOptionIds;
    private String lastWrongChoice;
    private int wrongCount;
    private Instant firstWrongAt;
    private Instant lastPracticedAt;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class OptionDto {
        private Long optionId;
        private String optionText;
    }
}
