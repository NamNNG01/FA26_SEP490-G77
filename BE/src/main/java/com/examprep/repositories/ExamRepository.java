package com.examprep.repositories;

import com.examprep.entities.Exam;
import com.examprep.dto.IdCount;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import java.util.List;

@Repository
public interface ExamRepository extends JpaRepository<Exam, Long> {
    boolean existsByModuleModuleId(Long moduleId);
    boolean existsByCourseCourseIdOrModuleCourseCourseId(Long courseId, Long moduleCourseId);

    @Query("SELECT new com.examprep.dto.IdCount(e.module.moduleId, COUNT(e)) FROM Exam e WHERE e.module.moduleId IN :ids GROUP BY e.module.moduleId")
    List<IdCount> countByModules(@Param("ids") List<Long> ids);

    @Query("SELECT new com.examprep.dto.IdCount(c.courseId, COUNT(DISTINCT e.examId)) FROM Exam e LEFT JOIN e.module m, Course c " +
            "WHERE c.courseId IN :ids AND (e.course.courseId = c.courseId OR m.course.courseId = c.courseId) GROUP BY c.courseId")
    List<IdCount> countByCourses(@Param("ids") List<Long> ids);
}
