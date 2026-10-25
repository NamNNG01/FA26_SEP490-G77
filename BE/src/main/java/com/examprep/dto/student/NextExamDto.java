package com.examprep.dto.student;

import java.math.BigDecimal;

public record NextExamDto(Long examId, String title, Integer durationMinutes, BigDecimal maxScore) {}
