package com.examprep.dto.exam;

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
public class AttemptResponse {
    private Long attemptId;
    private Long examId;
    private String examTitle;
    private Instant startTime;
    private Instant submitTime;
    private BigDecimal totalScore;
    private String status; // IN_PROGRESS, GRADING, COMPLETED
    private List<AttemptAnswerDto> answers;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class AttemptAnswerDto {
        private Long answerId;
        private Long questionId;
        private String gradingStatus; // AUTO, PENDING_AI, AI_GRADED, FAILED
        private BigDecimal scoreEarned;
        private Boolean isCorrect;
        private Object aiFeedback;
    }
}
