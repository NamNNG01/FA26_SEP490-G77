package com.examprep.repositories;

import com.examprep.dto.student.CourseExamDto;
import com.examprep.entities.Exam;
import com.examprep.dto.IdCount;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import java.util.List;
import java.util.Optional;
import jakarta.persistence.LockModeType;

@Repository
public interface ExamRepository extends JpaRepository<Exam, Long>, JpaSpecificationExecutor<Exam> {
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT e FROM Exam e WHERE e.examId = :id")
    Optional<Exam> findForUpdate(@Param("id") Long id);
    boolean existsByModuleModuleId(Long moduleId);
    boolean existsByCourseCourseIdOrModuleCourseCourseId(Long courseId, Long moduleCourseId);

    @Query("SELECT new com.examprep.dto.IdCount(e.module.moduleId, COUNT(e)) FROM Exam e WHERE e.module.moduleId IN :ids AND e.mode = 'EXAM' GROUP BY e.module.moduleId")
    List<IdCount> countByModules(@Param("ids") List<Long> ids);

    @Query("SELECT new com.examprep.dto.IdCount(c.courseId, COUNT(DISTINCT e.examId)) FROM Exam e LEFT JOIN e.module m, Course c " +
            "WHERE c.courseId IN :ids AND e.mode = 'EXAM' AND (e.course.courseId = c.courseId OR m.course.courseId = c.courseId) GROUP BY c.courseId")
    List<IdCount> countByCourses(@Param("ids") List<Long> ids);

    @Override
    @EntityGraph(attributePaths = {
            "course",
            "module",
            "module.course"
    })
    Page<Exam> findAll(
            Specification<Exam> spec,
            Pageable pageable
    );

    @Query(
            value = """
        SELECT new com.examprep.dto.student.CourseExamDto(
            ex.examId, ex.title, ex.durationMinutes, ex.maxScore,
            (SELECT COUNT(eq) FROM ExamQuestion eq WHERE eq.exam = ex),
            (SELECT COUNT(att) FROM ExamAttempt att WHERE att.exam = ex AND att.user.userId = :userId),
            (SELECT MAX(att.totalScore) FROM ExamAttempt att WHERE att.exam = ex AND att.user.userId = :userId),
            (SELECT latest.status FROM ExamAttempt latest
             WHERE latest.exam = ex AND latest.user.userId = :userId
               AND NOT EXISTS (
                   SELECT newer.attemptId FROM ExamAttempt newer
                   WHERE newer.exam = ex AND newer.user.userId = :userId
                     AND (newer.startTime > latest.startTime
                       OR (newer.startTime = latest.startTime AND newer.attemptId > latest.attemptId))
               )),
            CASE WHEN (SELECT COUNT(active) FROM ExamAttempt active
                       WHERE active.exam = ex AND active.user.userId = :userId
                         AND active.status = 'IN_PROGRESS') > 0
                 THEN true ELSE false END,
            m.moduleId,
            CAST(NULL AS String)
        )
        FROM Exam ex LEFT JOIN ex.module m
        WHERE ex.course.courseId = :courseId AND ex.status = 'PUBLISHED' AND ex.mode = 'EXAM'
          AND (m IS NULL OR m.status <> 'HIDDEN')
        """,
            countQuery = """
        SELECT COUNT(ex) FROM Exam ex
        WHERE ex.course.courseId = :courseId AND ex.status = 'PUBLISHED' AND ex.mode = 'EXAM'
          AND NOT EXISTS (SELECT hm FROM Module hm WHERE hm = ex.module AND hm.status = 'HIDDEN')
        """
    )
    Page<CourseExamDto> findCourseExamsWithStats(
            @Param("courseId") Long courseId,
            @Param("userId") Long userId,
            Pageable pageable
    );

    @Query("""
    SELECT COUNT(e)
    FROM Exam e
    WHERE e.course.courseId = :courseId
      AND e.status = 'PUBLISHED'
      AND e.mode = 'EXAM'
      AND NOT EXISTS (SELECT hm FROM Module hm WHERE hm = e.module AND hm.status = 'HIDDEN')
    """)
    long countPublishedExamsByCourseId(@Param("courseId") Long courseId);

    /** [moduleId, published exam count] of the course — CL-02 module summary. */
    @Query("""
    SELECT new com.examprep.dto.IdCount(e.module.moduleId, COUNT(e))
    FROM Exam e
    WHERE e.course.courseId = :courseId
      AND e.status = 'PUBLISHED'
      AND e.mode = 'EXAM'
      AND e.module IS NOT NULL
    GROUP BY e.module.moduleId
    """)
    List<com.examprep.dto.IdCount> countPublishedExamsByModule(@Param("courseId") Long courseId);

    /** [examId, questionType] of the fixed questions of these exams — MC-02 exam kind. */
    @Query("SELECT eq.exam.examId, q.questionType FROM ExamQuestion eq JOIN eq.question q WHERE eq.exam.examId IN :examIds")
    List<Object[]> findQuestionTypesByExamIds(@Param("examIds") java.util.Collection<Long> examIds);

    /** [examId, questionType] of the random-draw configs of these exams — MC-02 exam kind. */
    @Query("SELECT c.exam.examId, c.questionType FROM ExamConfig c WHERE c.exam.examId IN :examIds")
    List<Object[]> findConfigTypesByExamIds(@Param("examIds") java.util.Collection<Long> examIds);

    @Query("SELECT new com.examprep.dto.student.QuestionTypeCountDto(q.questionType, CAST(COUNT(eq) AS int), eq.weight) " +
           "FROM ExamQuestion eq JOIN eq.question q " +
           "WHERE eq.exam.examId = :examId AND q.status = 'ACTIVE' AND q.approvalStatus = 'APPROVED' AND q.deletedAt IS NULL " +
           "GROUP BY q.questionType, eq.weight")
    List<com.examprep.dto.student.QuestionTypeCountDto> getExamQuestionTypeSummaries(@Param("examId") Long examId);
}
