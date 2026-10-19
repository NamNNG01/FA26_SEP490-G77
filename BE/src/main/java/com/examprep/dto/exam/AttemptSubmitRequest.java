package com.examprep.dto.exam;

import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AttemptSubmitRequest {
    @NotNull(message = "Exam ID is required")
    private Long examId;

    @NotNull(message = "Answers list is required")
    private List<AnswerSubmitDto> answers;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class AnswerSubmitDto {
        @NotNull(message = "Question ID is required")
        private Long questionId;

        private Object response; // JSON object representing student answer
        private String essayAnswer;
    }
}
