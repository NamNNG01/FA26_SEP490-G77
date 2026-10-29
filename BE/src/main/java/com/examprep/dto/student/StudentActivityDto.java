package com.examprep.dto.student;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.Instant;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class StudentActivityDto {
    private String activityType; // EXAM, FLASHCARD, QUIZ
    private Long refId;
    private String title;
    private BigDecimal score;
    private BigDecimal maxScore;
    private Integer learnedCount;
    private Integer totalCards;
    private Instant happenedAt;
}
