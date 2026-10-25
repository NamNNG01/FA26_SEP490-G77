package com.examprep.dto.student;

import java.math.BigDecimal;
import java.time.Instant;

public record MyExamDto(
        Long attemptId,
        Long examId,
        String examTitle,
        Instant startTime,
        Instant submittedAt,
        BigDecimal totalScore,
        BigDecimal maxScore,
        String status
) {}
