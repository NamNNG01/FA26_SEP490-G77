package com.examprep.repositories;

import com.examprep.entities.Question;
import com.examprep.dto.IdCount;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import java.util.List;

@Repository
public interface QuestionRepository extends JpaRepository<Question, Long> {
    boolean existsByModuleModuleId(Long moduleId);
    boolean existsByModuleCourseCourseId(Long courseId);

    @Query("SELECT new com.examprep.dto.IdCount(q.module.moduleId, COUNT(q)) FROM Question q WHERE q.module.moduleId IN :ids GROUP BY q.module.moduleId")
    List<IdCount> countByModules(@Param("ids") List<Long> ids);
}

