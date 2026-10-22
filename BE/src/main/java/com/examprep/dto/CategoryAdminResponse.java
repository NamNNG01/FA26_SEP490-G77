package com.examprep.dto;

public record CategoryAdminResponse(Long categoryId, String code, String name, Integer sortOrder, Boolean isActive) {}
