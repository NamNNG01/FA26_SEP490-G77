package com.examprep.dto.student;

import java.util.List;

public record ExamQuestionsByTypeSummary(List<QuestionTypeCountDto> byType, Integer totalCount) {}
