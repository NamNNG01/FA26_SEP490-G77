package com.examprep.dto;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

public record CourseResponse(Long courseId, String title, String slug, Long categoryId, String categoryName,
                             Long managerId, String managerName, String thumbnailUrl, BigDecimal price,
                             Boolean isPublished, long moduleCount, long studentCount, long examCount,
                             Instant createdAt, Instant updatedAt, String description, List<ModuleResponse> modules) {}
