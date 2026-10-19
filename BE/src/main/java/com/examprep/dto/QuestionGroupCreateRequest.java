package com.examprep.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class QuestionGroupCreateRequest {

    @NotNull(message = "Course ID is required")
    private Long courseId;

    private Long moduleId;

    @Size(max = 255, message = "Title must not exceed 255 characters")
    private String title;

    private String passageText;
}
