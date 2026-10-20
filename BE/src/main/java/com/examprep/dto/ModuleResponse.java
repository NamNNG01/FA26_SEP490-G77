package com.examprep.dto;

public record ModuleResponse(Long moduleId, Long courseId, String title, String description,
                             int orderIndex, long questionCount, long examCount) {}
