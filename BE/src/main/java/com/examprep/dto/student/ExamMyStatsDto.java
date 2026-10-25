package com.examprep.dto.student;

import java.math.BigDecimal;

public record ExamMyStatsDto(Long attemptCount, BigDecimal bestScore, String latestStatus) {}
