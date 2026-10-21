package com.examprep.repositories;

import com.examprep.entities.CourseManager;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface CourseManagerRepository extends JpaRepository<CourseManager, Long> {
    @EntityGraph(attributePaths = "user")
    List<CourseManager> findByCourseCourseIdOrderByCourseManagerIdAsc(Long courseId);

    boolean existsByCourse_CourseIdAndUser_UserId(Long courseId, Long userId);
    boolean existsByCourseCourseIdAndUserUserId(Long courseId, Long userId);
    void deleteByCourseCourseIdAndUserUserId(Long courseId, Long userId);
    void deleteByCourseCourseId(Long courseId);
}

