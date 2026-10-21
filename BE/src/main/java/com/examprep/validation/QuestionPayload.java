package com.examprep.validation;

import com.examprep.dto.question.AnswerOptionDto;
import com.examprep.dto.question.QuestionCreateRequest;
import com.examprep.dto.question.QuestionUpdateRequest;
import com.examprep.entities.AnswerOption;
import com.examprep.entities.Question;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class QuestionPayload {
    private String questionType;
    private String difficulty;
    private String status;
    private String content;
    private BigDecimal defaultPoints;
    private Object questionMetadata;
    private Object answerKey;
    private Object essayGradingRubric;
    private List<AnswerOptionDto> options;
    private List<Object> correctOrder;

    public static QuestionPayload from(QuestionCreateRequest req) {
        if (req == null) return null;
        return QuestionPayload.builder()
                .questionType(req.getQuestionType())
                .difficulty(req.getDifficulty())
                .status(req.getStatus())
                .content(req.getContent())
                .defaultPoints(req.getDefaultPoints())
                .questionMetadata(req.getQuestionMetadata())
                .answerKey(req.getAnswerKey())
                .essayGradingRubric(req.getEssayGradingRubric())
                .options(req.getOptions())
                .correctOrder(req.getCorrectOrder())
                .build();
    }

    public static QuestionPayload from(QuestionUpdateRequest req) {
        if (req == null) return null;
        return QuestionPayload.builder()
                .questionType(req.getQuestionType())
                .difficulty(req.getDifficulty())
                .status(req.getStatus())
                .content(req.getContent())
                .defaultPoints(req.getDefaultPoints())
                .questionMetadata(req.getQuestionMetadata())
                .answerKey(req.getAnswerKey())
                .essayGradingRubric(req.getEssayGradingRubric())
                .options(req.getOptions())
                .correctOrder(req.getCorrectOrder())
                .build();
    }

    public static QuestionPayload fromEntity(Question q, List<AnswerOption> options, ObjectMapper objectMapper) {
        if (q == null) return null;
        List<AnswerOptionDto> optDtos = options != null ? options.stream().map(o -> AnswerOptionDto.builder()
                .optionId(o.getOptionId())
                .optionText(o.getOptionText())
                .isCorrect(o.getIsCorrect())
                .explanation(o.getExplanation())
                .orderIndex(o.getOrderIndex())
                .build()).collect(Collectors.toList()) : null;

        Object metaObj = null;
        try {
            if (q.getQuestionMetadata() != null && objectMapper != null) {
                metaObj = objectMapper.readValue(q.getQuestionMetadata(), Object.class);
            }
        } catch (Exception ignored) {}

        Object akObj = null;
        List<Object> coList = null;
        try {
            if (q.getAnswerKey() != null && objectMapper != null) {
                akObj = objectMapper.readValue(q.getAnswerKey(), Object.class);
                if (akObj instanceof Map) {
                    Object coObj = ((Map<?, ?>) akObj).get("correctOrder");
                    if (coObj instanceof List) {
                        coList = (List<Object>) coObj;
                    }
                }
            }
        } catch (Exception ignored) {}

        Object rubricObj = null;
        try {
            if (q.getEssayGradingRubric() != null && objectMapper != null) {
                rubricObj = objectMapper.readValue(q.getEssayGradingRubric(), Object.class);
            }
        } catch (Exception ignored) {}

        return QuestionPayload.builder()
                .questionType(q.getQuestionType())
                .difficulty(q.getDifficulty())
                .status(q.getStatus())
                .content(q.getContent())
                .defaultPoints(q.getDefaultPoints())
                .questionMetadata(metaObj)
                .answerKey(akObj)
                .essayGradingRubric(rubricObj)
                .options(optDtos)
                .correctOrder(coList)
                .build();
    }
}
