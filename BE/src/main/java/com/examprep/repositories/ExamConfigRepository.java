package com.examprep.repositories;

import com.examprep.entities.ExamConfig;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.Collection;
import java.util.List;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
@Repository
public interface ExamConfigRepository extends JpaRepository<ExamConfig, Long> {
    java.util.List<ExamConfig> findByExamExamIdOrderByConfigIdAsc(Long examId);
    void deleteByExamExamId(Long examId);
    boolean existsByModuleModuleId(Long moduleId);
    boolean existsByModuleCourseCourseId(Long courseId);
    @Query("""
    SELECT ec
    FROM ExamConfig ec
    WHERE ec.exam.examId IN :examIds
    ORDER BY ec.exam.examId, ec.configId
    """)
    List<ExamConfig> findAllByExamIds(
            @Param("examIds") Collection<Long> examIds
    );
}

