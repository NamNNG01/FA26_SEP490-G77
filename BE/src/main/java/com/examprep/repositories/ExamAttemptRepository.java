package com.examprep.repositories;

import com.examprep.dto.StudentRecentAttempt;
import com.examprep.dto.student.MyExamDto;
import com.examprep.entities.ExamAttempt;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

@Repository
public interface ExamAttemptRepository extends JpaRepository<ExamAttempt, Long> {
    boolean existsByExamExamId(Long examId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT a FROM ExamAttempt a WHERE a.attemptId = :id")
    Optional<ExamAttempt> lockById(@Param("id") Long id);

    @Query("SELECT a FROM ExamAttempt a LEFT JOIN FETCH a.exam e LEFT JOIN FETCH e.course WHERE a.attemptId = :id")
    Optional<ExamAttempt> findWithExamById(@Param("id") Long id);

    @Query("SELECT COUNT(a) FROM ExamAttempt a WHERE a.user.userId = :userId AND (a.mode IS NULL OR a.mode <> 'REVIEW')")
    long countByUserId(@Param("userId") Long userId);

    @Query("SELECT AVG(a.totalScore) FROM ExamAttempt a WHERE a.user.userId = :userId AND a.totalScore IS NOT NULL AND (a.mode IS NULL OR a.mode <> 'REVIEW')")
    Number averageScoreByUserId(@Param("userId") Long userId);

    @Query("SELECT new com.examprep.dto.StudentRecentAttempt(a.attemptId, a.exam.examId, a.exam.title, a.totalScore, a.status, a.submitTime) " +
            "FROM ExamAttempt a " +
            "WHERE a.user.userId = :userId AND a.submitTime IS NOT NULL AND (a.mode IS NULL OR a.mode <> 'REVIEW') " +
            "ORDER BY a.submitTime DESC")
    List<StudentRecentAttempt> findRecentAttemptsByUserId(@Param("userId") Long userId, Pageable pageable);

    @Query("""
    SELECT COUNT(DISTINCT a.exam.examId)
    FROM ExamAttempt a
    WHERE a.user.userId = :userId
      AND a.exam.course.courseId = :courseId
      AND a.exam.status = 'PUBLISHED'
      AND a.exam.mode = 'EXAM'
      AND NOT EXISTS (SELECT hm FROM Module hm WHERE hm = a.exam.module AND hm.status = 'HIDDEN')
      AND a.status IN ('SUBMITTED', 'COMPLETED')
    """)
    long countCompletedExamsByUserAndCourse(@Param("userId") Long userId, @Param("courseId") Long courseId);

    @Query("""
    SELECT AVG(a.totalScore * 10.0 / a.exam.maxScore)
    FROM ExamAttempt a
    WHERE a.user.userId = :userId
      AND a.exam.course.courseId = :courseId
      AND a.exam.status = 'PUBLISHED'
      AND a.exam.mode = 'EXAM'
      AND NOT EXISTS (SELECT hm FROM Module hm WHERE hm = a.exam.module AND hm.status = 'HIDDEN')
      AND a.status IN ('SUBMITTED', 'COMPLETED')
      AND a.totalScore IS NOT NULL
      AND a.exam.maxScore > 0
    """)
    Double averageScoreByUserAndCourse(@Param("userId") Long userId, @Param("courseId") Long courseId);

    @Query("""
    SELECT new com.examprep.dto.IdCount(m.moduleId, COUNT(DISTINCT a.exam.examId))
    FROM ExamAttempt a JOIN a.exam.module m
    WHERE a.user.userId = :userId
      AND a.exam.course.courseId = :courseId
      AND a.exam.status = 'PUBLISHED'
      AND a.exam.mode = 'EXAM'
      AND m.status <> 'HIDDEN'
      AND a.status IN ('SUBMITTED', 'COMPLETED')
    GROUP BY m.moduleId
    """)
    List<com.examprep.dto.IdCount> countCompletedExamsByModuleGroup(@Param("userId") Long userId, @Param("courseId") Long courseId);

    @Query("""
    SELECT COUNT(DISTINCT a.exam.examId)
    FROM ExamAttempt a
    WHERE a.user.userId = :userId
      AND a.exam.course.courseId = :courseId
      AND a.exam.module IS NULL
      AND a.exam.status = 'PUBLISHED'
      AND a.exam.mode = 'EXAM'
      AND a.status IN ('SUBMITTED', 'COMPLETED')
    """)
    long countCompletedExamsGeneral(@Param("userId") Long userId, @Param("courseId") Long courseId);

    @Query("SELECT a FROM ExamAttempt a JOIN FETCH a.exam e WHERE a.user.userId = :userId AND e.course.courseId = :courseId AND a.submitTime IS NOT NULL AND e.mode = 'EXAM' ORDER BY a.submitTime DESC")
    List<ExamAttempt> findRecentAttemptsByUserAndCourse(@Param("userId") Long userId, @Param("courseId") Long courseId, Pageable pageable);

    @Query(value = "SELECT a FROM ExamAttempt a LEFT JOIN FETCH a.exam e " +
            "WHERE a.user.userId = :userId AND a.submitTime IS NOT NULL " +
            "AND (:mode IS NULL OR " +
            "     (:mode = 'EXAM' AND a.mode IN ('EXAM', 'CONTEST', 'PRACTICE', 'PRACTICE_EXAM')) OR " +
            "     (:mode = 'PRACTICE' AND a.mode IN ('PRACTICE', 'PRACTICE_EXAM')) OR " +
            "     (:mode = 'QUIZ' AND a.mode = 'QUIZ') OR " +
            "     (:mode = a.mode)) " +
            "ORDER BY a.submitTime DESC",
            countQuery = "SELECT COUNT(a) FROM ExamAttempt a " +
            "WHERE a.user.userId = :userId AND a.submitTime IS NOT NULL " +
            "AND (:mode IS NULL OR " +
            "     (:mode = 'EXAM' AND a.mode IN ('EXAM', 'CONTEST', 'PRACTICE', 'PRACTICE_EXAM')) OR " +
            "     (:mode = 'PRACTICE' AND a.mode IN ('PRACTICE', 'PRACTICE_EXAM')) OR " +
            "     (:mode = 'QUIZ' AND a.mode = 'QUIZ') OR " +
            "     (:mode = a.mode))")
    Page<ExamAttempt> findActivityAttemptsByUserAndMode(@Param("userId") Long userId, @Param("mode") String mode, Pageable pageable);

    @Query("SELECT a FROM ExamAttempt a LEFT JOIN FETCH a.exam e WHERE a.user.userId = :userId AND a.submitTime IS NOT NULL AND a.mode <> 'REVIEW' ORDER BY a.submitTime DESC")
    Page<ExamAttempt> findActivityAttemptsByUser(@Param("userId") Long userId, Pageable pageable);

    @Query("""
    SELECT new com.examprep.dto.student.MyExamDto(
        ex.examId,
        ex.title,
        c.courseId,
        c.title,
        ex.maxScore,
        COUNT(att),
        MAX(CASE
            WHEN att.status IN ('SUBMITTED', 'GRADING', 'COMPLETED')
            THEN att.totalScore
            ELSE NULL
        END),
        ex.mode,
        CASE WHEN EXISTS (
            SELECT 1 FROM ExamQuestion eq WHERE eq.exam = ex AND eq.question.questionType = 'CODE'
        ) THEN true ELSE false END
    )
    FROM ExamAttempt att
    JOIN att.exam ex
    LEFT JOIN ex.course c
    WHERE att.user.userId = :userId AND (att.mode IS NULL OR att.mode <> 'REVIEW')
    GROUP BY ex.examId, ex.title, c.courseId, c.title, ex.maxScore, ex.mode
    ORDER BY MAX(att.startTime) DESC
    """)
    Page<MyExamDto> findMyExams(
            @Param("userId") Long userId,
            Pageable pageable
    );

    @Query("SELECT att FROM ExamAttempt att WHERE att.exam.examId = :examId AND att.user.userId = :userId AND att.status = :status")
    Optional<ExamAttempt> findActiveAttempt(@Param("examId") Long examId, @Param("userId") Long userId, @Param("status") String status);

    List<ExamAttempt> findByExam_ExamIdAndUser_UserId(
            Long examId,
            Long userId
    );
    Page<ExamAttempt> findByExam_ExamIdAndUser_UserId(
            Long examId, Long userId, Pageable pageable
    );

    Page<ExamAttempt> findByUserUserIdAndExamExamIdOrderByStartTimeDescAttemptIdDesc(
            Long userId, Long examId, Pageable pageable);

    List<ExamAttempt> findByUser_UserIdAndExam_ExamIdAndStatusAndMode(
            Long userId, Long examId, String status, String mode);

    @Query("SELECT a.exam.examId, MAX(a.totalScore), COUNT(a) FROM ExamAttempt a WHERE a.exam.examId IN :examIds AND a.user.userId = :userId GROUP BY a.exam.examId")
    List<Object[]> findAttemptStatsByExamIds(@Param("examIds") Collection<Long> examIds, @Param("userId") Long userId);
}
