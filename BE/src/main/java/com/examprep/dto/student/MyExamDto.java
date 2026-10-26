package com.examprep.dto.student;

import java.math.BigDecimal;

public record MyExamDto(
        Long examId,
        String title,
        Long courseId,
        String courseTitle,
        BigDecimal maxScore,
        Long attemptCount,
        BigDecimal bestScore
) {}