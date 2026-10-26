package com.examprep.repositories;

import com.examprep.entities.AttemptStartKey;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

@Repository
public interface AttemptStartKeyRepository extends JpaRepository<AttemptStartKey, Long> {

    /** SA-01 idempotent replay: the attempt created for this (user, key) pair. */
    Optional<AttemptStartKey> findByUserUserIdAndIdempotencyKey(Long userId, String idempotencyKey);

    /** SA-07: every key issued for one attempt, so cancelling it can drop them too. */
    List<AttemptStartKey> findByAttempt_AttemptId(Long attemptId);

    /** Keys expire 24h after creation (spec 6.1); stale rows are dropped on the next start. */
    @Modifying
    @Query("DELETE FROM AttemptStartKey k WHERE k.expiresAt < :now")
    int deleteExpiredBefore(@Param("now") Instant now);
}
