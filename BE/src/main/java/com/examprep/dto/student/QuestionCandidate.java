package com.examprep.dto.student;

/** A question a generated exam (PQ-01, AI-01) may draw. moduleId/moduleTitle are null for course-level questions. */
public record QuestionCandidate(Long questionId, Long moduleId, String moduleTitle, String difficulty, String questionType,
                                String content) {}
