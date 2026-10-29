package com.examprep.dto.student;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CourseProgressDto {
    private Long courseId;
    private long totalExams;
    private long completedExams;
    private long totalDecks;
    private long learnedDecks;
    private BigDecimal averageScore;
    private int progress;
    private List<RecentAttemptItem> recentAttempts;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class RecentAttemptItem {
        private Long attemptId;
        private String examTitle;
        private BigDecimal totalScore;
        private BigDecimal maxScore;
        private Instant submittedAt;
    }
}
