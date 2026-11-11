package com.examprep.dto;

import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class QuestionGroupUpdateRequest {

    @Pattern(regexp = "QUIZ|ESSAY|CODE|DIAGRAM",
            message = "Question type must be one of QUIZ, ESSAY, CODE, DIAGRAM")
    private String questionType;

    @Size(max = 255, message = "Title must not exceed 255 characters")
    private String title;

    private String passageText;
}
