package com.examprep.dto.student;

import java.math.BigDecimal;

public record ExamDetailDto(
        Long examId,
        Long courseId,
        String title,
        String description,
        Integer durationMinutes,
        Boolean isPractice,
        String generationType,
        BigDecimal maxScore,
        String status,
        ExamQuestionsByTypeSummary questionsSummary,
        ExamMyStatsDto myStats,
        ExamActionsDto actions
) {}
