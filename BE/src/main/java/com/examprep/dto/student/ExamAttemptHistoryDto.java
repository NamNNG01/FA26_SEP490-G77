package com.examprep.dto.student;

import java.math.BigDecimal;
import java.time.Instant;

public record ExamAttemptHistoryDto(
        Long attemptId,
        String status,
        BigDecimal totalScore,
        BigDecimal maxScore,
        Instant startTime,
        Instant submittedAt,
        Boolean autoSubmitted
) {}