package com.examprep.dto.student;

import java.math.BigDecimal;

public record QuestionTypeCountDto(String questionType, Integer count, BigDecimal weightEach) {}
