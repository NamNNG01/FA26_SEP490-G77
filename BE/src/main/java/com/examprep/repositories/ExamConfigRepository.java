package com.examprep.repositories;

import com.examprep.entities.ExamConfig;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface ExamConfigRepository extends JpaRepository<ExamConfig, Long> {
    java.util.List<ExamConfig> findByExamExamIdOrderByConfigIdAsc(Long examId);
    void deleteByExamExamId(Long examId);
    boolean existsByModuleModuleId(Long moduleId);
    boolean existsByModuleCourseCourseId(Long courseId);
}

