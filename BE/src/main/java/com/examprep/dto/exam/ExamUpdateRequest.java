package com.examprep.dto.exam;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ExamUpdateRequest {
    private String title;
    private String description;
    private Integer durationMinutes;
    private Integer passMark;
    private Integer maxAttempts;
    private Boolean isPractice;
}
