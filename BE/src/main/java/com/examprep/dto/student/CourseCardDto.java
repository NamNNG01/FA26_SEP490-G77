package com.examprep.dto.student;

import java.math.BigDecimal;

public record CourseCardDto(
        Long courseId,
        String title,
        String slug,
        String thumbnailUrl,
        BigDecimal price,
        CategoryRefDto category,
        ManagerRefDto manager,
        Long publishedExamCount,
        Long deckCount,
        Boolean isEnrolled
) {}
