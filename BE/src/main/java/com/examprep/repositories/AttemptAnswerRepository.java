package com.examprep.repositories;

import com.examprep.entities.AttemptAnswer;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

@Repository
public interface AttemptAnswerRepository extends JpaRepository<AttemptAnswer, Long> {
    boolean existsByQuestion_QuestionId(Long questionId);
    List<AttemptAnswer> findByAttempt_AttemptId(Long attemptId);
    List<AttemptAnswer> findByGradingStatus(String gradingStatus);

    boolean existsByGradingStatus(String gradingStatus);

    @Query("SELECT a FROM AttemptAnswer a JOIN FETCH a.question WHERE a.attempt.attemptId = :attemptId")
    List<AttemptAnswer> findWithQuestionByAttemptId(@Param("attemptId") Long attemptId);

    @Query("SELECT a FROM AttemptAnswer a JOIN FETCH a.question JOIN FETCH a.attempt WHERE a.attemptAnswerId = :id")
    Optional<AttemptAnswer> findWithQuestionById(@Param("id") Long id);

    @Query("SELECT COALESCE(SUM(a.weightSnapshot), 0) FROM AttemptAnswer a WHERE a.attempt.attemptId = :attemptId")
    BigDecimal sumWeightByAttemptId(@Param("attemptId") Long attemptId);

    // AG-W01 claim: concurrent workers skip rows another worker already holds.
    @Query(value = "SELECT attempt_answer_id FROM attempt_answers WHERE grading_status = 'QUEUED' "
            + "ORDER BY attempt_answer_id LIMIT 1 FOR UPDATE SKIP LOCKED", nativeQuery = true)
    List<Long> lockNextQueued();

    @Query("SELECT a.attemptAnswerId FROM AttemptAnswer a WHERE a.gradingStatus = 'GRADING' AND a.gradingLockedAt < :cutoff")
    List<Long> findStuckGrading(@Param("cutoff") Instant cutoff);

    /** SA-02/04/05: every answer of one attempt in insertion (paper) order, one query. */
    @Query("SELECT aa FROM AttemptAnswer aa WHERE aa.attempt.attemptId = :attemptId ORDER BY aa.attemptAnswerId")
    List<AttemptAnswer> findByAttemptIdOrdered(@Param("attemptId") Long attemptId);

    /**
     * SA-06: W = Σ weight_snapshot of every question, for a whole page of attempts in one
     * grouped query (spec 0.3 rule 9). Rows come back as {@code [attemptId, sum]}.
     */
    @Query("SELECT aa.attempt.attemptId, SUM(aa.weightSnapshot) FROM AttemptAnswer aa " +
            "WHERE aa.attempt.attemptId IN :attemptIds GROUP BY aa.attempt.attemptId")
    List<Object[]> sumWeightsByAttemptIds(@Param("attemptIds") Collection<Long> attemptIds);

    /**
     * SA-06: Σ weight_snapshot of the questions that still have no score, for a whole page of
     * attempts. Attempts whose every question is graded produce no row.
     */
    @Query("SELECT aa.attempt.attemptId, SUM(aa.weightSnapshot) FROM AttemptAnswer aa " +
            "WHERE aa.attempt.attemptId IN :attemptIds AND aa.scoreEarned IS NULL " +
            "GROUP BY aa.attempt.attemptId")
    List<Object[]> sumPendingWeightsByAttemptIds(@Param("attemptIds") Collection<Long> attemptIds);
}
