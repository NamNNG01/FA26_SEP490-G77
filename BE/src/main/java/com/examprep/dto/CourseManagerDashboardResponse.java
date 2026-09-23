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
public class CourseManagerDashboardResponse {

    private Summary summary;
    private List<RecentCourse> recentCourses;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Summary {

        private long totalCourses;
        private long publishedCourses;
        private long draftCourses;
        private long totalStudents;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class RecentCourse {

        private Long courseId;
        private String title;
        private String status;
        private Long studentCount;
    }
}
