package com.examprep.repositories;

import com.examprep.dto.CmAttemptFact;
import com.examprep.dto.student.CourseExamDto;
import com.examprep.entities.Exam;
import com.examprep.dto.IdCount;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import java.util.Collection;
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

    @Query("SELECT new com.examprep.dto.IdCount(e.module.moduleId, COUNT(e)) FROM Exam e WHERE e.module.moduleId IN :ids AND e.mode IN ('EXAM', 'CONTEST') GROUP BY e.module.moduleId")
    List<IdCount> countByModules(@Param("ids") List<Long> ids);

    @Query("SELECT new com.examprep.dto.IdCount(c.courseId, COUNT(DISTINCT e.examId)) FROM Exam e LEFT JOIN e.module m, Course c " +
            "WHERE c.courseId IN :ids AND e.mode IN ('EXAM', 'CONTEST') AND (e.course.courseId = c.courseId OR m.course.courseId = c.courseId) GROUP BY c.courseId")
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

    @Query("""
    SELECT new com.examprep.dto.IdCount(m.moduleId, COUNT(e))
    FROM Exam e JOIN e.module m
    WHERE e.course.courseId = :courseId
      AND e.status = 'PUBLISHED'
      AND e.mode = 'EXAM'
      AND m.status <> 'HIDDEN'
    GROUP BY m.moduleId
    """)
    List<com.examprep.dto.IdCount> countPublishedExamsByModuleGroup(@Param("courseId") Long courseId);

    @Query("""
    SELECT COUNT(e)
    FROM Exam e
    WHERE e.course.courseId = :courseId
      AND e.module IS NULL
      AND e.status = 'PUBLISHED'
      AND e.mode = 'EXAM'
    """)
    long countPublishedExamsGeneral(@Param("courseId") Long courseId);

    /** [examId, questionType] of the fixed questions of these exams — MC-02 exam kind. */
    @Query("SELECT eq.exam.examId, q.questionType FROM ExamQuestion eq JOIN eq.question q WHERE eq.exam.examId IN :examIds")
    List<Object[]> findQuestionTypesByExamIds(@Param("examIds") java.util.Collection<Long> examIds);

    /** [examId, questionType] of the random-draw configs of these exams — MC-02 exam kind. */
    @Query("SELECT c.exam.examId, c.questionType FROM ExamConfig c WHERE c.exam.examId IN :examIds")
    List<Object[]> findConfigTypesByExamIds(@Param("examIds") java.util.Collection<Long> examIds);

    @Query("SELECT COUNT(eq) " +
           "FROM ExamQuestion eq JOIN eq.question q " +
           "WHERE eq.exam.examId = :examId AND q.status = 'ACTIVE' AND q.deletedAt IS NULL")
    long countActiveQuestionsByExamId(@Param("examId") Long examId);

    /** PQ-02: list custom practice exams owned by this user, newest first. */
    @Query("SELECT e FROM Exam e WHERE e.createdBy.userId = :userId AND (e.mode = 'PRACTICE_EXAM' OR (e.mode = 'PRACTICE' AND e.practiceConfig IS NOT NULL)) AND e.status <> 'ARCHIVED' ORDER BY e.createdAt DESC, e.examId DESC")
    Page<Exam> findPracticeExams(@Param("userId") Long userId, Pageable pageable);

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
          AND ((:moduleId IS NULL AND m IS NULL) OR (m.moduleId = :moduleId))
        ORDER BY ex.publishedAt DESC, ex.examId DESC
        """
    )
    List<CourseExamDto> findExamsByModuleOrGeneral(
            @Param("courseId") Long courseId,
            @Param("moduleId") Long moduleId,
            @Param("userId") Long userId
    );

    /**
     * DASH-05: course exams the manager created in the given courses, as
     * {@code (examId, title, status, courseId, courseTitle)}. An exam may hang off the course
     * directly or off one of its modules, hence the explicit left joins (an implicit join would
     * drop rows with a null course).
     */
    @Query("SELECT e.examId, e.title, e.status, COALESCE(c.courseId, mc.courseId), COALESCE(c.title, mc.title) "
            + "FROM Exam e LEFT JOIN e.course c LEFT JOIN e.module m LEFT JOIN m.course mc "
            + "WHERE e.createdBy.userId = :userId AND e.mode IN ('EXAM', 'CONTEST') "
            + "AND COALESCE(c.courseId, mc.courseId) IN :courseIds "
            + "ORDER BY e.createdAt DESC, e.examId DESC")
    List<Object[]> findMyCourseExamsForDashboard(@Param("userId") Long userId,
                                                 @Param("courseIds") Collection<Long> courseIds);

    /**
     * DASH-05: every submitted attempt of those exams, one row per attempt, with the frozen max
     * score snapshot so a later exam edit cannot restate an old attempt's percentage.
     */
    @Query("SELECT new com.examprep.dto.CmAttemptFact(e.examId, COALESCE(c.courseId, mc.courseId), a.status, "
            + "a.totalScore, a.submittedAt, a.startTime, e.maxScore, a.examSnapshot) "
            + "FROM ExamAttempt a JOIN a.exam e LEFT JOIN e.course c LEFT JOIN e.module m LEFT JOIN m.course mc "
            + "WHERE e.createdBy.userId = :userId AND e.mode IN ('EXAM', 'CONTEST') "
            + "AND COALESCE(c.courseId, mc.courseId) IN :courseIds AND a.submittedAt IS NOT NULL")
    List<CmAttemptFact> findAttemptFactsForManager(@Param("userId") Long userId,
                                                   @Param("courseIds") Collection<Long> courseIds);
}
