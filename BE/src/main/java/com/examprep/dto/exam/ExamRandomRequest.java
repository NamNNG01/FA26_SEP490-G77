package com.examprep.dto.exam;

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
public class ExamRandomRequest {
    @NotNull(message = "Course ID is required")
    private Long courseId;

    @NotBlank(message = "Title is required")
    private String title;

    private String description;

    @NotNull(message = "Duration minutes is required")
    private Integer durationMinutes;

    private Long moduleId;

    @NotNull(message = "Criteria list is required")
    private List<ExamCriteriaDto> criteria;

    private Long seed;

    @Builder.Default
    private Integer passMark = 50;

    @Builder.Default
    private Integer maxAttempts = 1;

    @Builder.Default
    private Boolean isPractice = false;
}
