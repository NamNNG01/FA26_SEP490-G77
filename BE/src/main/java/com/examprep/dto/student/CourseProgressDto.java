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
    private int progress;
    private ItemCount questions;
    private ItemCount exams;
    private ItemCount decks;
    private List<ModuleProgressDto> modules;
    private BigDecimal averageScore;
    private List<RecentAttemptItem> recentAttempts;

    // Backward compatibility fields
    private long totalExams;
    private long completedExams;
    private long totalDecks;
    private long learnedDecks;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ItemCount {
        private long done;
        private long total;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ModuleProgressDto {
        private Long moduleId;
        private String title;
        private Integer progress;
        private ItemCount questions;
        private ItemCount exams;
        private ItemCount decks;
    }

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
