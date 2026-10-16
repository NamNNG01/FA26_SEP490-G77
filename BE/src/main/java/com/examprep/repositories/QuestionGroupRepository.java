package com.examprep.repositories;

import com.examprep.entities.QuestionGroup;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface QuestionGroupRepository extends JpaRepository<QuestionGroup, Long> {
    boolean existsByModuleModuleId(Long moduleId);
    boolean existsByCourseCourseIdOrModuleCourseCourseId(Long courseId, Long moduleCourseId);
}

