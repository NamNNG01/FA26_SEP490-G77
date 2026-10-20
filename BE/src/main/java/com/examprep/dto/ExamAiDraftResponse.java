package com.examprep.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.databind.JsonNode;
import java.util.List;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record ExamAiDraftResponse(String fileName, String title, String description, Integer durationMinutes,
        int questionCount, List<DraftQuestion> questions, List<String> sourceExcerpts, List<String> warnings) {
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record DraftQuestion(Long questionId, String content, String questionType, String difficulty,
            List<Option> options, String explanation, JsonNode questionMetadata, String essayGradingRubric) { }
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Option(String optionText, Boolean isCorrect, Integer orderIndex, String correctMatch) { }
}
