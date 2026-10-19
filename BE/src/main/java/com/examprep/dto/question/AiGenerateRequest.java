
package com.examprep.dto.question;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.LinkedHashMap;
import java.util.Map;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AiGenerateRequest {

    @NotNull(message = "Course ID is required")
    private Long courseId;

    @NotEmpty(message = "At least one question type is required")
    @Valid
    private Map<
            @NotNull(message = "Question type cannot be null")
                    String,
            @NotNull(message = "Question count cannot be null")
            @Positive(message = "Question count must be greater than 0")
            @Max(value = 50, message = "Question count cannot exceed 50")
                    Integer
            > questionTypeCounts;

    private String difficulty;

    private String context;

    private Long documentId;

    private Long moduleId;

    @Builder.Default
    private String language = "Vietnamese";
}
