package com.examprep.dto;

public record ModuleResponse(Long moduleId, Long courseId, String title, String description,
                             int orderIndex, String status, long questionCount, long examCount) {}
