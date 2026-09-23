package com.examprep.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class StudentDashboardResponse {

    private Summary summary;
    private List<StudentRecentCourse> recentCourses;
    private List<StudentRecentAttempt> recentAttempts;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Summary {

        private long enrolledCourses;
        private long activeCourses;
        private long completedCourses;
        private long totalAttempts;
        private double averageScore;
    }
}
