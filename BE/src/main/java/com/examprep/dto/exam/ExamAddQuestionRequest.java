package com.examprep.dto.exam;

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
public class ExamAddQuestionRequest {
    @NotNull(message = "Question ID is required")
    private Long questionId;
    private BigDecimal points;
}
