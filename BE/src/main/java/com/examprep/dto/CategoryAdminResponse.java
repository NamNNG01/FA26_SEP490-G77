package com.examprep.dto;

public record CategoryAdminResponse(
        Long categoryId,
        String name,
        String slug,
        String description,
        Integer sortOrder,
        Boolean isActive
) {}
