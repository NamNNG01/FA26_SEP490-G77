package com.examprep.dto.question;

import jakarta.validation.constraints.NotEmpty;
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
public class QuestionBatchStatusRequest {
    @NotEmpty(message = "Question IDs list cannot be empty")
    private List<Long> questionIds;
    @NotNull(message = "Status is required")
    private String status; // INACTIVE, ACTIVE, ARCHIVED
}
