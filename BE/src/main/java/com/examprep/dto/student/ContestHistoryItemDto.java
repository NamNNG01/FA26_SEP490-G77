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
public class ContestHistoryItemDto {
    private Long contestId;
    private String title;
    private Instant registeredAt;
    private BigDecimal score;
    private Integer rank;
    private String status;
    private CourseRef course;
    private Instant startTime;

    @Data
    @AllArgsConstructor
    @NoArgsConstructor
    public static class CourseRef {
        private Long courseId;
        private String title;
    }
}
