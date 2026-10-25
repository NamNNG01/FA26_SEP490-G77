package com.examprep.dto.student;

import java.math.BigDecimal;
import java.time.Instant;

public record MyCourseDto(
        Long courseId,
        String title,
        String slug,
        String thumbnailUrl,
        BigDecimal price,
        CategoryRefDto category,
        ManagerRefDto manager,
        Instant enrolledAt,
        String status,
        Integer progress,
        Long publishedExamCount,
        Long deckCount,
        NextExamDto nextExam
) {}
