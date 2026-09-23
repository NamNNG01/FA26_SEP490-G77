package com.examprep.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ManagerCourseInfo {

    private Long courseId;
    private String title;
    private Boolean isPublished;
    private Long studentCount;
}
