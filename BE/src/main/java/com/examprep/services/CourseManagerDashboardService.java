package com.examprep.services;

import com.examprep.dto.CourseManagerDashboardDtos;

import java.util.List;

/** DASH-05: the Course Manager dashboard panels, scoped to the caller's courses and exams. */
public interface CourseManagerDashboardService {

    CourseManagerDashboardDtos.Summary summary(Long userId);

    List<CourseManagerDashboardDtos.CourseStat> courses(Long userId);

    /**
     * @param courseId    optional filter; an id outside the caller's scope yields no rows
     * @param minAttempts attempts below this fade in the UI and rank last (default 5, 1..100)
     */
    List<CourseManagerDashboardDtos.ExamStat> exams(Long userId, Long courseId, Integer minAttempts);
}
