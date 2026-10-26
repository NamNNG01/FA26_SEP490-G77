package com.examprep.dto.student;

public record ExamActionsDto(
        Boolean canStart,
        Long activeAttemptId,
        Boolean canViewHistory,
        String reason
) {}