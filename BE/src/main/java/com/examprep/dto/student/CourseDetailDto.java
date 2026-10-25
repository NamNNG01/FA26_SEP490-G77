package com.examprep.dto.student;

import java.math.BigDecimal;
import java.util.List;

public record CourseDetailDto(
        Long courseId,
        String title,
        String slug,
        String description,
        String thumbnailUrl,
        BigDecimal price,
        CategoryRefDto category,
        ManagerRefDto manager,
        List<ModuleItemDto> modules,
        CourseStatsDto stats,
        EnrollmentSummaryDto enrollment
) {}
