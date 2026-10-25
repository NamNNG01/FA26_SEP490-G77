package com.examprep.dto.student;
import java.math.BigDecimal;
import java.time.Instant;

public record ExamDetailDto(
        Long examId,
        Long courseId,
        String courseTitle,
        String title,
        String description,
        Integer durationMinutes,
        BigDecimal maxScore,
        Integer questionCount,
        Instant publishedAt,
        ExamMyStatsDto myStats,
        ExamActionsDto actions
) {}