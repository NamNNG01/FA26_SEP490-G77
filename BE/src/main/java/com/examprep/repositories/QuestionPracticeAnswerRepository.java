package com.examprep.repositories;

import com.examprep.entities.QuestionPracticeAnswer;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;

@Repository
public interface QuestionPracticeAnswerRepository extends JpaRepository<QuestionPracticeAnswer, Long> {

    /** MP-06: every attempt of one question, oldest first. */
    List<QuestionPracticeAnswer> findBySessionQuestion_SessionQuestionIdOrderByAttemptNumberAsc(Long sessionQuestionId);

    /**
     * MP-04 (batch): the attempts of several paper rows in one query, each row's attempts oldest
     * first — so the caller can group them in memory instead of issuing a query per question.
     */
    @Query("SELECT a FROM QuestionPracticeAnswer a "
            + "WHERE a.sessionQuestion.sessionQuestionId IN :sessionQuestionIds "
            + "ORDER BY a.sessionQuestion.sessionQuestionId, a.attemptNumber")
    List<QuestionPracticeAnswer> findBySessionQuestionIds(
            @Param("sessionQuestionIds") List<Long> sessionQuestionIds);

    /**
     * MP-05/MP-06: the newest attempt of one question. The paper row is always projected from this
     * answer, so a late grading result can never contradict the attempt shown to the student.
     */
    java.util.Optional<QuestionPracticeAnswer> findFirstBySessionQuestion_SessionQuestionIdOrderByAttemptNumberDesc(
            Long sessionQuestionId);

    /** MP-05 idempotency: the attempt already stored under this client key, if any. */
    @Query("SELECT a FROM QuestionPracticeAnswer a WHERE a.sessionQuestion.sessionQuestionId = :sessionQuestionId "
            + "AND a.requestKey = :requestKey")
    List<QuestionPracticeAnswer> findByRequestKey(@Param("sessionQuestionId") Long sessionQuestionId,
                                                  @Param("requestKey") String requestKey);

    /**
     * MP-05 attempt allocation: the highest attempt number of one paper row, read while that row is
     * locked by {@code QuestionPracticeSessionQuestionRepository#lockInSession}.
     */
    @Query("SELECT COALESCE(MAX(a.attemptNumber), 0) FROM QuestionPracticeAnswer a "
            + "WHERE a.sessionQuestion.sessionQuestionId = :sessionQuestionId")
    int maxAttemptNumber(@Param("sessionQuestionId") Long sessionQuestionId);

    /**
     * The AI rubric worker claim (same shape as {@code AttemptAnswerRepository#lockNextQueued}):
     * concurrent workers skip rows another worker already holds.
     */
    @Query(value = "SELECT practice_answer_id FROM question_practice_answers WHERE grading_status = 'QUEUED' "
            + "ORDER BY practice_answer_id LIMIT 1 FOR UPDATE SKIP LOCKED", nativeQuery = true)
    List<Long> lockNextQueued();

    @Query("SELECT a.practiceAnswerId FROM QuestionPracticeAnswer a "
            + "WHERE a.gradingStatus = 'GRADING' AND a.gradingLockedAt < :cutoff")
    List<Long> findStuckGrading(@Param("cutoff") Instant cutoff);

    boolean existsByGradingStatus(String gradingStatus);

    /**
     * MP-08 attempt statistics of one session. Rows come back as
     * {@code [totalAttempts, gradedAttempts, correctAttempts, wrongAttempts]}.
     * A submission still waiting for the AI grader is counted in {@code total} only.
     */
    @Query("SELECT COUNT(a), "
            + "COALESCE(SUM(CASE WHEN a.gradingStatus IN ('AUTO', 'AI_GRADED') THEN 1 ELSE 0 END), 0), "
            + "COALESCE(SUM(CASE WHEN a.gradingStatus IN ('AUTO', 'AI_GRADED') AND a.isCorrect = TRUE THEN 1 ELSE 0 END), 0), "
            + "COALESCE(SUM(CASE WHEN a.gradingStatus IN ('AUTO', 'AI_GRADED') AND a.isCorrect = FALSE THEN 1 ELSE 0 END), 0) "
            + "FROM QuestionPracticeAnswer a WHERE a.sessionQuestion.session.sessionId = :sessionId")
    List<Object[]> summarizeSession(@Param("sessionId") Long sessionId);

    /**
     * MP-03/MP-11 long-term progress of one student on one question <em>of one module</em>, summed
     * over every session: {@code [totalAttempts, gradedAttempts, correctAttempts, wrongAttempts,
     * bestScore, firstAnsweredAt, lastAnsweredAt]}. The module filter matches the uniqueness rule of
     * the progress table, so a question re-parented to another module cannot leak its old counts in.
     */
    @Query("SELECT COUNT(a), "
            + "COALESCE(SUM(CASE WHEN a.gradingStatus IN ('AUTO', 'AI_GRADED') THEN 1 ELSE 0 END), 0), "
            + "COALESCE(SUM(CASE WHEN a.gradingStatus IN ('AUTO', 'AI_GRADED') AND a.isCorrect = TRUE THEN 1 ELSE 0 END), 0), "
            + "COALESCE(SUM(CASE WHEN a.gradingStatus IN ('AUTO', 'AI_GRADED') AND a.isCorrect = FALSE THEN 1 ELSE 0 END), 0), "
            + "MAX(a.scoreEarned), MIN(a.answeredAt), MAX(a.answeredAt) "
            + "FROM QuestionPracticeAnswer a "
            + "WHERE a.sessionQuestion.question.questionId = :questionId "
            + "AND a.sessionQuestion.session.user.userId = :userId "
            + "AND a.sessionQuestion.session.module.moduleId = :moduleId")
    List<Object[]> summarizeProgress(@Param("userId") Long userId, @Param("moduleId") Long moduleId,
                                     @Param("questionId") Long questionId);

    /** Result of the newest finalized attempt of one student/question in one module; empty while none is finalized. */
    @Query("SELECT a.isCorrect FROM QuestionPracticeAnswer a "
            + "WHERE a.sessionQuestion.question.questionId = :questionId "
            + "AND a.sessionQuestion.session.user.userId = :userId "
            + "AND a.sessionQuestion.session.module.moduleId = :moduleId "
            + "AND a.gradingStatus IN ('AUTO', 'AI_GRADED') "
            + "ORDER BY a.answeredAt DESC, a.practiceAnswerId DESC")
    List<Boolean> findFinalizedResultsNewestFirst(@Param("userId") Long userId,
                                                  @Param("moduleId") Long moduleId,
                                                  @Param("questionId") Long questionId,
                                                  Pageable pageable);

    /** Loads attempts for progress computation in a single query (replaces summarizeProgress + findFinalizedResultsNewestFirst). */
    @Query("SELECT a FROM QuestionPracticeAnswer a "
            + "WHERE a.sessionQuestion.question.questionId = :questionId "
            + "AND a.sessionQuestion.session.user.userId = :userId "
            + "AND a.sessionQuestion.session.module.moduleId = :moduleId "
            + "ORDER BY a.answeredAt DESC, a.practiceAnswerId DESC")
    List<QuestionPracticeAnswer> findAttemptsForProgress(@Param("userId") Long userId,
                                                         @Param("moduleId") Long moduleId,
                                                         @Param("questionId") Long questionId);

    /**
     * The same history for a General run: every attempt of one question that was practised through a
     * session with no module, so a module session of the same course never leaks into it.
     */
    @Query("SELECT a FROM QuestionPracticeAnswer a "
            + "WHERE a.sessionQuestion.question.questionId = :questionId "
            + "AND a.sessionQuestion.session.user.userId = :userId "
            + "AND a.sessionQuestion.session.course.courseId = :courseId "
            + "AND a.sessionQuestion.session.module IS NULL "
            + "ORDER BY a.answeredAt DESC, a.practiceAnswerId DESC")
    List<QuestionPracticeAnswer> findGeneralAttemptsForProgress(@Param("userId") Long userId,
                                                                @Param("courseId") Long courseId,
                                                                @Param("questionId") Long questionId);
}
