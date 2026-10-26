package com.examprep.dto.student;

import java.math.BigDecimal;
import java.time.Instant;

public record ExamMyStatsDto(
        Long attemptCount,
        BigDecimal bestScore,
        Instant lastSubmittedAt,
        Long lastAttemptId
) {}