package com.examprep.repositories;

import com.examprep.entities.AiUsageLog;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.Modifying;

@Repository
public interface AiUsageLogRepository extends JpaRepository<AiUsageLog, Long> {
    boolean existsByCourseCourseId(Long courseId);

    @Query("SELECT COALESCE(SUM(l.inputTokens + l.outputTokens), 0) FROM AiUsageLog l WHERE l.user.userId = :userId AND l.createdAt >= :startDate")
    Integer sumTokensByUserSince(@Param("userId") Long userId, @Param("startDate") Instant startDate);

    // Student AI quota (Part 2 §9.9): [settled tokens, tokens still reserved] for every AI purpose.
    // FAILED/TIMEOUT logs are refunded.
    @Query("""
            SELECT COALESCE(SUM(CASE WHEN l.status IN ('SUCCESS', 'PARTIAL')
                        THEN COALESCE(l.inputTokens, 0) + COALESCE(l.outputTokens, 0) ELSE 0 END), 0),
                   COALESCE(SUM(CASE WHEN l.status = 'PENDING' THEN l.reservedTokens ELSE 0 END), 0)
            FROM AiUsageLog l
            WHERE l.user.userId = :userId AND l.billingSource = :source
              AND l.createdAt >= :from AND l.createdAt < :to""")
    List<Object[]> sumStudentUsage(@Param("userId") Long userId, @Param("source") String source,
            @Param("from") Instant from, @Param("to") Instant to);

    Optional<AiUsageLog> findFirstByAttemptAnswerIdAndStatusOrderByLogIdDesc(Long attemptAnswerId, String status);

    // Reservations nobody settled within the window are refunded; grading logs wait while their answer is queued.
    @Modifying
    @Query(value = """
            UPDATE ai_usage_logs SET status = 'FAILED', reserved_tokens = 0, error_message = 'RESERVATION_EXPIRED'
            WHERE status = 'PENDING' AND created_at < :cutoff
              AND NOT EXISTS (SELECT 1 FROM attempt_answers a
                              WHERE a.attempt_answer_id = ai_usage_logs.attempt_answer_id
                                AND a.grading_status IN ('QUEUED', 'GRADING'))""", nativeQuery = true)
    int expirePending(@Param("cutoff") Instant cutoff);
}
