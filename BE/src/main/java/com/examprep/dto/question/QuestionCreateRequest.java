package com.examprep.dto.question;

import jakarta.validation.constraints.NotBlank;
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
public class QuestionCreateRequest {

    @NotNull(message = "Course ID is required")
    private Long courseId;

    private Long moduleId;
    private Long groupId;

    @NotBlank(message = "Question type is required")
    private String questionType;

    private String difficulty;
    private String status;

    @NotBlank(message = "Content is required")
    private String content;

    private String explanation; // maps to ai_explanation
    private Object questionMetadata;
    private Object answerKey;
    private Object essayGradingRubric;
    private List<AnswerOptionDto> options;
    private List<Object> correctOrder;
}
