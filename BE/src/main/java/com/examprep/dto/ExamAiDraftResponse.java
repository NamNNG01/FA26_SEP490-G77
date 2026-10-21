package com.examprep.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.databind.JsonNode;
import java.math.BigDecimal;
import java.util.List;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record ExamAiDraftResponse(String fileName, String title, String description, Integer durationMinutes,
        int questionCount, List<DraftQuestion> questions, List<String> sourceExcerpts, List<String> warnings) {
    // Same shape Q-03 (POST /questions/batch) accepts, so a draft can be saved as-is. plantUmlSource (DIAGRAM only)
    // is the source behind questionMetadata.drawioXml, for previews; Q-03 ignores it.
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record DraftQuestion(String content, String questionType, String difficulty, BigDecimal defaultPoints,
            List<Option> options, JsonNode answerKey, String explanation, JsonNode questionMetadata,
            JsonNode essayGradingRubric, String plantUmlSource) { }
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Option(String optionText, Boolean isCorrect, Integer orderIndex) { }
}
