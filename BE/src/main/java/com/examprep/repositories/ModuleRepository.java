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
    long countByCourseCourseIdAndStatus(Long courseId, String status);
    void deleteByCourseCourseId(Long courseId);

    @Query("SELECT new com.examprep.dto.IdCount(m.course.courseId, COUNT(m)) FROM Module m WHERE m.course.courseId IN :ids GROUP BY m.course.courseId")
    List<IdCount> countByCourses(@Param("ids") List<Long> ids);

    @Query("SELECT COALESCE(MAX(m.orderIndex), 0) FROM Module m WHERE m.course.courseId = :courseId")
    int maxOrder(@Param("courseId") Long courseId);

    @Query("SELECT m.course.courseId FROM Module m WHERE m.moduleId = :id")
    Optional<Long> findCourseId(@Param("id") Long id);

    /** The module a lesson belongs to, scoped to the course MQ-03 validated the lesson against. */
    @Query(value = """
            SELECT l.module_id FROM lessons l JOIN modules m ON m.module_id = l.module_id
            WHERE l.lesson_id = :lessonId AND m.course_id = :courseId
            """, nativeQuery = true)
    Optional<Long> findModuleIdByLessonAndCourse(@Param("lessonId") Long lessonId,
                                                 @Param("courseId") Long courseId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT m FROM Module m WHERE m.moduleId = :id")
    Optional<Module> findForUpdate(@Param("id") Long id);

    @Query("""
    SELECT m FROM Module m
    WHERE m.course.courseId = :courseId
      AND m.status = 'VISIBLE'
    ORDER BY m.orderIndex ASC, m.moduleId ASC
    """)
    List<Module> findVisibleModulesByCourseId(@Param("courseId") Long courseId);
}

