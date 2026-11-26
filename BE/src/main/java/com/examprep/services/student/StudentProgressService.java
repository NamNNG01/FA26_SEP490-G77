package com.examprep.services.student;

import com.examprep.dto.student.CourseProgressDto;
import com.examprep.dto.student.StudentActivityDto;
import org.springframework.data.domain.Page;

public interface StudentProgressService {
    CourseProgressDto getCourseProgress(Long courseId, Long userId);
    Page<StudentActivityDto> getActivityHistory(String type, int page, int size, Long userId);
}
