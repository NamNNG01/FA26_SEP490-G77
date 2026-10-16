package com.examprep.dto;

public record CategoryResponse(Long categoryId, String name, String slug, String description, Long parentId) {}
