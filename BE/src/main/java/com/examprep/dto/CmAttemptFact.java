package com.examprep.dto;

import java.math.BigDecimal;
import java.time.Instant;

/**
 * One submitted attempt of an exam a course manager created, as the dashboard aggregates it.
 * {@code courseId} is the exam's course (or its module's course); {@code examSnapshot} carries the
 * frozen max score, so a later exam edit cannot restate an old attempt's percentage.
 */
public record CmAttemptFact(
        Long examId,
        Long courseId,
        String status,
        BigDecimal totalScore,
        Instant submittedAt,
        Instant startTime,
        BigDecimal examMaxScore,
        String examSnapshot) {
}
