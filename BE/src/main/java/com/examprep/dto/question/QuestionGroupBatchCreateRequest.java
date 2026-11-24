package com.examprep.dto.question;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class QuestionGroupBatchCreateRequest {

    @NotNull(message = "Course ID is required")
    private Long courseId;

    private Long moduleId;

    @NotBlank(message = "Question type is required")
    @Pattern(regexp = "QUIZ|ESSAY|CODE|DIAGRAM|DIAGRAM_ESSAY",
            message = "Question type must be one of QUIZ, ESSAY, CODE, DIAGRAM, DIAGRAM_ESSAY")
    private String questionType;

    @NotBlank(message = "Group title is required")
    @Size(max = 255, message = "Title must not exceed 255 characters")
    private String title;

    @NotBlank(message = "Shared passage is required")
    private String passageText;

    @NotEmpty(message = "Question group must have at least 1 question")
    @Size(min = 1, max = 50, message = "Batch size must be between 1 and 50")
    @Valid
    private List<QuestionCreateRequest> questions;
}
