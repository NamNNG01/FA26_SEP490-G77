package com.examprep.dto.question;

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
public class AiSaveRequest {
    @NotNull(message = "Log ID is required")
    private Long logId;

    @NotNull(message = "Course ID is required")
    private Long courseId;

    private Long moduleId;
    private String status;

    @NotNull(message = "Questions list is required")
    private List<QuestionCreateRequest> questions;
}
