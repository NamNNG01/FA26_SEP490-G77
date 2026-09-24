package com.examprep.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.Instant;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class StudentRecentAttempt {

    private Long attemptId;
    private Long examId;
    private String examTitle;
    private BigDecimal score;
    private String status;
    private Instant submittedAt;
}
