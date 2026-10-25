package com.examprep.dto.student;

import java.math.BigDecimal;
import java.time.Instant;

public record ActiveAttemptDto(
        Long attemptId,
        Long examId,
        Instant startTime,
        Instant deadlineAt,
        String status,
        Integer durationMinutes,
        BigDecimal maxScore
) {}
