package com.examprep.repositories;

import com.examprep.entities.Module;
import com.examprep.dto.IdCount;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import java.util.List;
import java.util.Optional;

@Repository
public interface ModuleRepository extends JpaRepository<Module, Long> {
    List<Module> findByCourseCourseIdOrderByOrderIndexAscModuleIdAsc(Long courseId);
    long countByCourseCourseId(Long courseId);
    void deleteByCourseCourseId(Long courseId);

    @Query("SELECT new com.examprep.dto.IdCount(m.course.courseId, COUNT(m)) FROM Module m WHERE m.course.courseId IN :ids GROUP BY m.course.courseId")
    List<IdCount> countByCourses(@Param("ids") List<Long> ids);

    @Query("SELECT COALESCE(MAX(m.orderIndex), 0) FROM Module m WHERE m.course.courseId = :courseId")
    int maxOrder(@Param("courseId") Long courseId);

    @Query("SELECT m.course.courseId FROM Module m WHERE m.moduleId = :id")
    Optional<Long> findCourseId(@Param("id") Long id);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT m FROM Module m WHERE m.moduleId = :id")
    Optional<Module> findForUpdate(@Param("id") Long id);
}

