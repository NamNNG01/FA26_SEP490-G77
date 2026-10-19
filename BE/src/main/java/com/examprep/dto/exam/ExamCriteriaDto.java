package com.examprep.dto.exam;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ExamCriteriaDto {
    @NotBlank(message = "Question type is required in criteria")
    private String questionType;

    private String difficulty;
    private Long moduleId;
    private String skillTag;

    @NotNull(message = "Count is required in criteria")
    private Integer count;

    private BigDecimal pointsEach;
}
