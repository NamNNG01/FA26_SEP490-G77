package com.examprep.repositories;

import com.examprep.entities.Course;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

/** Scalar summaries for course/module question counts; never load question bodies or attempt entities. */
public interface CourseProgressSummaryRepository extends JpaRepository<Course, Long> {

    /** Result of counting questions in one module (moduleId = null is the General pool). */
    record ModuleQuestionCount(Long moduleId, long count) {}

    /**
     * Count total valid questions in each module of a course.
     */
    @Query("""
        SELECT new com.examprep.repositories.CourseProgressSummaryRepository$ModuleQuestionCount(
            m.moduleId,
            COUNT(q)
        )
        FROM Question q LEFT JOIN q.module m
        WHERE COALESCE(m.course.courseId, q.course.courseId) = :courseId
          AND (m IS NULL OR m.status <> 'HIDDEN')
          AND q.deletedAt IS NULL
          AND q.status = 'ACTIVE'
          AND q.approvalStatus = 'APPROVED'
          AND q.sourceDocumentId IS NULL
          AND NOT (COALESCE(q.source, '') = 'AI' AND COALESCE(q.creatorRole, '') = 'STUDENT')
        GROUP BY m.moduleId
        """)
    List<ModuleQuestionCount> countTotalQuestionsByModule(@Param("courseId") Long courseId);

    /**
     * Count valid questions a user has answered correctly at least once
     * (either in Practice OR in a submitted/completed Exam) per module of a course.
     */
    @Query("""
        SELECT new com.examprep.repositories.CourseProgressSummaryRepository$ModuleQuestionCount(
            m.moduleId,
            COUNT(q)
        )
        FROM Question q LEFT JOIN q.module m
        WHERE COALESCE(m.course.courseId, q.course.courseId) = :courseId
          AND (m IS NULL OR m.status <> 'HIDDEN')
          AND q.deletedAt IS NULL
          AND q.status = 'ACTIVE'
          AND q.approvalStatus = 'APPROVED'
          AND q.sourceDocumentId IS NULL
          AND NOT (COALESCE(q.source, '') = 'AI' AND COALESCE(q.creatorRole, '') = 'STUDENT')
          AND (
              EXISTS (
                  SELECT 1 FROM QuestionPracticeProgress p
                  WHERE p.question = q
                    AND p.user.userId = :userId
                    AND p.correctAttempts > 0
              )
              OR EXISTS (
                  SELECT 1 FROM AttemptAnswer aa
                  JOIN aa.attempt a
                  WHERE aa.question = q
                    AND a.user.userId = :userId
                    AND a.status IN ('SUBMITTED', 'COMPLETED')
                    AND aa.isCorrect = true
              )
          )
        GROUP BY m.moduleId
        """)
    List<ModuleQuestionCount> countCorrectQuestionsByModule(
            @Param("courseId") Long courseId,
            @Param("userId") Long userId
    );
}
