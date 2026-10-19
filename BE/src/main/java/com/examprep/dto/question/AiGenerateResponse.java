package com.examprep.dto.question;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AiGenerateResponse {
    private Long logId;
    private List<GeneratedQuestionPreview> questions;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class GeneratedQuestionPreview {
        private QuestionCreateRequest questionData;
        private boolean hasHashConflict;
        private String validationError;
    }
}
