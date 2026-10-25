package com.examprep.dto.student;

import java.math.BigDecimal;
import java.time.Instant;

public record CourseExamDto(
        Long examId,
        String title,
        String description,
        Integer durationMinutes,
        BigDecimal maxScore,
        String status,
        Instant publishedAt,
        ExamMyStatsDto myStats
) {}
