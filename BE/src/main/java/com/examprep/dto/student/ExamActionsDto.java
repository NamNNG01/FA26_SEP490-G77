package com.examprep.dto.student;

public record ExamActionsDto(Boolean canStart, Boolean canResume, Long activeAttemptId) {}
