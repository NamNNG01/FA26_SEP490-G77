package com.examprep.repositories;

import com.examprep.entities.AiUsageLog;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import jakarta.persistence.LockModeType;

@Repository
public interface AiUsageLogRepository extends JpaRepository<AiUsageLog, Long> {
    boolean existsByCourseCourseId(Long courseId);

    @Query("SELECT COALESCE(SUM(l.inputTokens + l.outputTokens), 0) FROM AiUsageLog l WHERE l.user.userId = :userId AND l.createdAt >= :startDate")
    Integer sumTokensByUserSince(@Param("userId") Long userId, @Param("startDate") Instant startDate);

    // Student AI quota (Part 2 §9.9): [settled tokens, tokens still reserved] for every AI purpose.
    // FAILED/TIMEOUT logs are refunded; both PENDING and PROCESSING rows hold active reservations.
    @Query("""
            SELECT COALESCE(SUM(CASE WHEN l.status IN ('SUCCESS', 'PARTIAL')
                        THEN COALESCE(l.inputTokens, 0) + COALESCE(l.outputTokens, 0) ELSE 0 END), 0),
                   COALESCE(SUM(CASE WHEN l.status IN ('PENDING', 'PROCESSING') THEN l.reservedTokens ELSE 0 END), 0)
            FROM AiUsageLog l
            WHERE l.user.userId = :userId AND l.billingSource = :source
              AND l.createdAt >= :from AND l.createdAt < :to""")
    List<Object[]> sumStudentUsage(@Param("userId") Long userId, @Param("source") String source,
            @Param("from") Instant from, @Param("to") Instant to);

    // Spec 8 (line 1016): running (PROCESSING) jobs still hold their reservation. The shared
    // sumStudentUsage only counts PENDING reservations (house-wide), so the flashcard/plan callers
    // add these sums on top of their snapshot. Window semantics mirror sumStudentUsage
    // (createdAt >= :from AND createdAt < :to) so the rows land in the caller's bucket.
    @Query("""
            SELECT l.billingSource, COALESCE(SUM(l.reservedTokens), 0)
            FROM AiUsageLog l
            WHERE l.user.userId = :userId AND l.status = 'PROCESSING'
              AND l.createdAt >= :from AND l.createdAt < :to
            GROUP BY l.billingSource""")
    List<Object[]> sumProcessingReservedByWindow(@Param("userId") Long userId,
            @Param("from") Instant from, @Param("to") Instant to);

    Optional<AiUsageLog> findFirstByAttemptAnswerIdAndStatusOrderByLogIdDesc(Long attemptAnswerId, String status);

    // Reservations nobody settled within the window are refunded; grading, flashcard and quiz-job logs stay protected while active.
    @Modifying(flushAutomatically = true)
    @Query(value = """
            UPDATE ai_usage_logs SET status = 'FAILED', reserved_tokens = 0, error_message = 'RESERVATION_EXPIRED'
            WHERE status = 'PENDING' AND created_at < :cutoff
              AND purpose <> 'FLASHCARD_GENERATE'
              AND NOT EXISTS (SELECT 1 FROM attempt_answers a
                              WHERE a.attempt_answer_id = ai_usage_logs.attempt_answer_id
                                AND a.grading_status IN ('QUEUED', 'GRADING'))
              AND NOT EXISTS (SELECT 1 FROM quiz_generation_jobs q
                              WHERE q.ai_usage_log_id = ai_usage_logs.log_id
                                AND q.status IN ('PENDING', 'PROCESSING'))""", nativeQuery = true)
    int expirePending(@Param("cutoff") Instant cutoff);

    // Worker claim (group E): pessimistic row lock so concurrent settlements cannot interleave.
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT l FROM AiUsageLog l WHERE l.logId = :logId")
    Optional<AiUsageLog> lockById(@Param("logId") Long logId);

    // Ownership check for the AI log detail endpoint.
    Optional<AiUsageLog> findByLogIdAndUserUserId(Long logId, Long userId);

    // ---- DASH-04: admin AI usage report -------------------------------------------------------
    // "Settled" = the request finished one way or another (SUCCESS / PARTIAL / FAILED / TIMEOUT).
    // PENDING and PROCESSING reservations are in flight and are never shown as a result.

    /** Input + output tokens of every settled request in the window. */
    @Query("SELECT COALESCE(SUM(COALESCE(l.inputTokens, 0) + COALESCE(l.outputTokens, 0)), 0) "
            + "FROM AiUsageLog l WHERE l.status IN ('SUCCESS', 'PARTIAL') "
            + "AND l.createdAt >= :from AND l.createdAt < :to")
    Long sumSettledTokensBetween(@Param("from") Instant from, @Param("to") Instant to);

    /** Settled requests in the window. */
    @Query("SELECT COUNT(l) FROM AiUsageLog l WHERE l.status IN ('SUCCESS', 'PARTIAL', 'FAILED', 'TIMEOUT') "
            + "AND l.createdAt >= :from AND l.createdAt < :to")
    long countSettledBetween(@Param("from") Instant from, @Param("to") Instant to);

    /** Failed / timed-out requests in the window. */
    @Query("SELECT COUNT(l) FROM AiUsageLog l WHERE l.status IN ('FAILED', 'TIMEOUT') "
            + "AND l.createdAt >= :from AND l.createdAt < :to")
    long countFailedBetween(@Param("from") Instant from, @Param("to") Instant to);

    /** Newest settled requests of the window with their user, newest first (paged so the report caps them). */
    @Query("SELECT l FROM AiUsageLog l JOIN FETCH l.user WHERE l.status IN ('SUCCESS', 'PARTIAL', 'FAILED', 'TIMEOUT') "
            + "AND l.createdAt >= :from AND l.createdAt < :to ORDER BY l.createdAt DESC, l.logId DESC")
    List<AiUsageLog> findRecentSettledBetween(@Param("from") Instant from, @Param("to") Instant to, Pageable pageable);
}
