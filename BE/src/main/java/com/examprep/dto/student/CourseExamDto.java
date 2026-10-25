package com.examprep.dto.student;

import java.math.BigDecimal;

public record CourseExamDto(
        Long examId,
        String title,
        Integer durationMinutes,
        BigDecimal maxScore,
        Long questionCount,
        Long myAttemptCount,
        BigDecimal myBestScore,
        String myLastStatus,
        Boolean hasActiveAttempt
) {}
