package com.examprep.dto.student;

import java.math.BigDecimal;

public record CourseExamDto(
        Long examId,
        String title,
        Integer durationMinutes,
        BigDecimal maxScore,
        Long questionCount,
        Long myAttemptCount,
        BigDecimal myBestScore,
        String myLastStatus,
        Boolean hasActiveAttempt,
        /** null when the exam is not filed under a module. */
        Long moduleId,
        /**
         * QUIZ / ESSAY / CODE from the question types (fixed and random-config), as the
         * manager side derives it: DIAGRAM questions count as ESSAY. MIXED when they span
         * several kinds; null when the exam has none.
         * Filled by the service after the page query.
         */
        String examKind
) {
    public CourseExamDto withExamKind(String kind) {
        return new CourseExamDto(examId, title, durationMinutes, maxScore, questionCount, myAttemptCount,
                myBestScore, myLastStatus, hasActiveAttempt, moduleId, kind);
    }
}
