package com.examprep.services.student;

import com.examprep.dto.student.CourseProgressDto;
import com.examprep.dto.student.StudentActivityDto;
import org.springframework.data.domain.Page;

public interface StudentProgressService {
    CourseProgressDto getCourseProgress(Long courseId, Long userId);
    Page<StudentActivityDto> getActivityHistory(String type, int page, int size, Long userId);

    /**
     * LP-01's completion percentage for one student and course, or -1 when the course currently has
     * no exams or decks to complete. Unlike {@link #getCourseProgress} it does not require an active
     * enrollment, so EN-03 can keep the persisted enrollment progress in sync.
     */
    int liveProgressPercent(Long userId, Long courseId);
}
