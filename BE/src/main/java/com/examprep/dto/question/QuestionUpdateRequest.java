package com.examprep.dto.question;

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
public class QuestionUpdateRequest {
    private Long moduleId;
    private Long groupId;
    private String questionType;
    private String difficulty;
    private String status;
    private String content;
    private String explanation;
    private BigDecimal defaultPoints;
    private Object questionMetadata;
    private Object answerKey;
    private Object essayGradingRubric;
    private List<AnswerOptionDto> options;
    private Long lockVersion;
}
