package com.examprep.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class StudentRecentCourse {

    private Long courseId;
    private String title;
    private String thumbnailUrl;
    private Integer progress;
}
