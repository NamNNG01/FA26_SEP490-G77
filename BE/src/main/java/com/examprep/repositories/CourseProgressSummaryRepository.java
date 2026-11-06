package com.examprep.repositories;

import com.examprep.entities.Course;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

/** Scalar summaries for a page of courses; never load question bodies or attempt entities. */
public interface CourseProgressSummaryRepository extends JpaRepository<Course, Long> {
    @Query("""
        SELECT COALESCE(m.course.courseId, q.course.courseId), m.moduleId, COUNT(q)
        FROM Question q LEFT JOIN q.module m
        WHERE COALESCE(m.course.courseId, q.course.courseId) IN :ids
          AND (m IS NULL OR m.status <> 'HIDDEN')
          AND q.deletedAt IS NULL AND q.status = 'ACTIVE'
          AND q.approvalStatus = 'APPROVED' AND q.sourceDocumentId IS NULL
        GROUP BY COALESCE(m.course.courseId, q.course.courseId), m.moduleId
        """)
    List<Object[]> questionTotals(@Param("ids") List<Long> ids);

    @Query("""
        SELECT COALESCE(m.course.courseId, p.course.courseId), m.moduleId, COUNT(p)
        FROM QuestionPracticeProgress p LEFT JOIN p.module m
        WHERE p.user.userId = :userId AND p.correctAttempts > 0
          AND COALESCE(m.course.courseId, p.course.courseId) IN :ids
          AND (m IS NULL OR m.status <> 'HIDDEN')
        GROUP BY COALESCE(m.course.courseId, p.course.courseId), m.moduleId
        """)
    List<Object[]> questionCompletions(@Param("ids") List<Long> ids, @Param("userId") Long userId);

    @Query("""
        SELECT e.course.courseId, m.moduleId, COUNT(e)
        FROM Exam e LEFT JOIN e.module m
        WHERE e.course.courseId IN :ids AND e.status = 'PUBLISHED' AND e.mode = 'EXAM'
          AND (m IS NULL OR m.status <> 'HIDDEN')
        GROUP BY e.course.courseId, m.moduleId
        """)
    List<Object[]> examTotals(@Param("ids") List<Long> ids);

    @Query("""
        SELECT e.course.courseId, m.moduleId, COUNT(DISTINCT e.examId)
        FROM ExamAttempt a JOIN a.exam e LEFT JOIN e.module m
        WHERE a.user.userId = :userId AND e.course.courseId IN :ids
          AND e.status = 'PUBLISHED' AND e.mode = 'EXAM'
          AND a.status IN ('SUBMITTED', 'COMPLETED')
          AND (m IS NULL OR m.status <> 'HIDDEN')
        GROUP BY e.course.courseId, m.moduleId
        """)
    List<Object[]> examCompletions(@Param("ids") List<Long> ids, @Param("userId") Long userId);

    @Query("""
        SELECT d.course.courseId, m.moduleId,
          (SELECT COUNT(f) FROM Flashcard f WHERE f.deck = d),
          (SELECT COUNT(p) FROM UserCardProgress p JOIN p.card f
             WHERE f.deck = d AND p.user.userId = :userId AND p.status = 'KNOWN')
        FROM Deck d LEFT JOIN d.module m
        WHERE d.course.courseId IN :ids AND (m IS NULL OR m.status <> 'HIDDEN')
          AND (d.user.roleName <> 'STUDENT' OR d.user.userId = :userId OR d.visibility = 'PUBLIC')
        """)
    List<Object[]> deckStats(@Param("ids") List<Long> ids, @Param("userId") Long userId);
}
