package com.examprep.repositories;

import com.examprep.entities.AttemptAnswer;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;

/** Read-only learning statistics of one student in one course (AI-01, AI-03, AI-04). Finished = SUBMITTED or COMPLETED. */
public interface LearningStatsRepository extends Repository<AttemptAnswer, Long> {

    /** [moduleId, moduleTitle, answered, correct] over graded answers; moduleId is null for questions without a module. */
    @Query("SELECT m.moduleId, m.title, COUNT(aa), SUM(CASE WHEN aa.isCorrect = true THEN 1 ELSE 0 END) " +
            "FROM AttemptAnswer aa JOIN aa.attempt a JOIN aa.question q LEFT JOIN q.module m " +
            "WHERE a.user.userId = :userId AND a.exam.course.courseId = :courseId AND a.status IN ('SUBMITTED', 'COMPLETED') " +
            "AND aa.isCorrect IS NOT NULL AND a.submittedAt >= :from AND a.submittedAt < :to GROUP BY m.moduleId, m.title")
    List<Object[]> moduleTotals(@Param("userId") Long userId, @Param("courseId") Long courseId,
                                @Param("from") Instant from, @Param("to") Instant to);

    /** [questionType, answered, correct]. */
    @Query("SELECT q.questionType, COUNT(aa), SUM(CASE WHEN aa.isCorrect = true THEN 1 ELSE 0 END) " +
            "FROM AttemptAnswer aa JOIN aa.attempt a JOIN aa.question q " +
            "WHERE a.user.userId = :userId AND a.exam.course.courseId = :courseId AND a.status IN ('SUBMITTED', 'COMPLETED') " +
            "AND aa.isCorrect IS NOT NULL AND a.submittedAt >= :from AND a.submittedAt < :to GROUP BY q.questionType")
    List<Object[]> typeTotals(@Param("userId") Long userId, @Param("courseId") Long courseId,
                              @Param("from") Instant from, @Param("to") Instant to);

    @Query("SELECT COUNT(a) FROM ExamAttempt a WHERE a.user.userId = :userId AND a.exam.course.courseId = :courseId " +
            "AND a.status IN ('SUBMITTED', 'COMPLETED') AND a.submittedAt >= :from")
    long finishedAttempts(@Param("userId") Long userId, @Param("courseId") Long courseId, @Param("from") Instant from);

    @Query("SELECT MAX(a.submittedAt) FROM ExamAttempt a WHERE a.user.userId = :userId AND a.exam.course.courseId = :courseId " +
            "AND a.status IN ('SUBMITTED', 'COMPLETED')")
    Instant lastSubmission(@Param("userId") Long userId, @Param("courseId") Long courseId);

    /** Newest wrong answers first, with question and module. */
    @Query("SELECT aa FROM AttemptAnswer aa JOIN FETCH aa.attempt a JOIN FETCH aa.question q LEFT JOIN FETCH q.module " +
            "WHERE a.user.userId = :userId AND a.exam.course.courseId = :courseId AND a.status IN ('SUBMITTED', 'COMPLETED') " +
            "AND aa.isCorrect = false AND a.submittedAt >= :from ORDER BY a.submittedAt DESC, aa.attemptAnswerId DESC")
    List<AttemptAnswer> wrongAnswers(@Param("userId") Long userId, @Param("courseId") Long courseId, @Param("from") Instant from,
                                     Pageable page);

    @Query("SELECT COUNT(aa) FROM AttemptAnswer aa JOIN aa.attempt a WHERE a.user.userId = :userId " +
            "AND a.exam.course.courseId = :courseId AND a.status IN ('SUBMITTED', 'COMPLETED') AND aa.isCorrect = false AND a.submittedAt >= :from")
    long wrongCount(@Param("userId") Long userId, @Param("courseId") Long courseId, @Param("from") Instant from);

    /** Distinct questions the student has answered at least once in the course (coverage, AI-03). */
    @Query("SELECT COUNT(DISTINCT aa.question.questionId) FROM AttemptAnswer aa JOIN aa.attempt a WHERE a.user.userId = :userId " +
            "AND a.exam.course.courseId = :courseId AND a.status IN ('SUBMITTED', 'COMPLETED') AND aa.isCorrect IS NOT NULL")
    long answeredQuestions(@Param("userId") Long userId, @Param("courseId") Long courseId);
}
