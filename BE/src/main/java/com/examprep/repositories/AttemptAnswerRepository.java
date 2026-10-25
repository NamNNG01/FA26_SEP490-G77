package com.examprep.repositories;

import com.examprep.entities.AttemptAnswer;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.time.Instant;
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
}
