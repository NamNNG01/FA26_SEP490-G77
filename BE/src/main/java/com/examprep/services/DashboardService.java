package com.examprep.services;

import com.examprep.dto.AdminDashboardResponse;
import com.examprep.dto.CourseManagerDashboardResponse;
import com.examprep.dto.StudentDashboardResponse;

public interface DashboardService {

    StudentDashboardResponse getStudentDashboard(Long userId);

    CourseManagerDashboardResponse getCourseManagerDashboard(Long userId);

    AdminDashboardResponse getAdminDashboard();
}
