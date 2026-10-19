package com.examprep.dto.exam;

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
public class ExamReorderRequest {
    @NotNull(message = "Exam question IDs list is required")
    private List<Long> examQuestionIds;
}
