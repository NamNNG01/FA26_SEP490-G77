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

    /**
     * [questionId, moduleId, moduleTitle, questionType, difficulty, isCorrect, submittedAt] of every graded answer since :from,
     * oldest first; moduleId is null for questions without a module.
     */
    @Query("SELECT q.questionId, m.moduleId, m.title, q.questionType, q.difficulty, aa.isCorrect, a.submittedAt " +
            "FROM AttemptAnswer aa JOIN aa.attempt a JOIN aa.question q LEFT JOIN q.module m " +
            "WHERE a.user.userId = :userId AND a.exam.course.courseId = :courseId AND a.status IN ('SUBMITTED', 'COMPLETED') " +
            "AND aa.isCorrect IS NOT NULL AND a.submittedAt >= :from ORDER BY a.submittedAt ASC, aa.attemptAnswerId ASC")
    List<Object[]> verdicts(@Param("userId") Long userId, @Param("courseId") Long courseId, @Param("from") Instant from);

    /** [moduleId, title] of the course's visible modules that have live questions, in course order. */
    @Query("SELECT m.moduleId, m.title FROM Module m WHERE m.course.courseId = :courseId AND m.status <> 'HIDDEN' " +
            "AND EXISTS (SELECT q FROM Question q WHERE q.module = m AND q.deletedAt IS NULL AND q.status = 'ACTIVE') " +
            "ORDER BY m.orderIndex, m.moduleId")
    List<Object[]> practicableModules(@Param("courseId") Long courseId);

    /** [examId, best score out of 10, finished attempts] of the student on the given exams. */
    @Query("SELECT a.exam.examId, MAX(a.totalScore * 10.0 / a.exam.maxScore), COUNT(a) FROM ExamAttempt a " +
            "WHERE a.user.userId = :userId AND a.exam.examId IN :examIds AND a.status IN ('SUBMITTED', 'COMPLETED') " +
            "AND a.totalScore IS NOT NULL AND a.exam.maxScore > 0 GROUP BY a.exam.examId")
    List<Object[]> bestScores(@Param("userId") Long userId, @Param("examIds") java.util.Collection<Long> examIds);

    @Query("SELECT COUNT(a) FROM ExamAttempt a WHERE a.user.userId = :userId AND a.exam.course.courseId = :courseId " +
            "AND a.status IN ('SUBMITTED', 'COMPLETED') AND a.submittedAt >= :from")
    long finishedAttempts(@Param("userId") Long userId, @Param("courseId") Long courseId, @Param("from") Instant from);

    @Query("SELECT MAX(a.submittedAt) FROM ExamAttempt a WHERE a.user.userId = :userId AND a.exam.course.courseId = :courseId " +
            "AND a.status IN ('SUBMITTED', 'COMPLETED')")
    Instant lastSubmission(@Param("userId") Long userId, @Param("courseId") Long courseId);

    /** Newest wrong answers first, with question and module (AI-04 dedupes and balances them per module). */
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

    /** [deckId, title] of the course's own decks plus the student's decks attached to it (AI-03 candidates). */
    @Query("SELECT d.deckId, d.title FROM Deck d WHERE d.course.courseId = :courseId " +
            "AND (d.user.roleName <> 'STUDENT' OR d.user.userId = :userId) ORDER BY d.deckId DESC")
    List<Object[]> courseDecks(@Param("userId") Long userId, @Param("courseId") Long courseId, Pageable page);

    /** [examId, title, moduleTitle] of the course's published exams in visible modules. */
    @Query("SELECT e.examId, e.title, m.title FROM Exam e LEFT JOIN e.module m WHERE e.course.courseId = :courseId " +
            "AND e.status = 'PUBLISHED' AND e.mode = 'EXAM' AND (m IS NULL OR m.status <> 'HIDDEN') ORDER BY e.examId DESC")
    List<Object[]> courseExams(@Param("courseId") Long courseId, Pageable page);
}
