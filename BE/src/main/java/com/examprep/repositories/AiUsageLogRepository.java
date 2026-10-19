package com.examprep.repositories;

import com.examprep.entities.AiUsageLog;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.Instant;

@Repository
public interface AiUsageLogRepository extends JpaRepository<AiUsageLog, Long> {
    boolean existsByCourseCourseId(Long courseId);

    @Query("SELECT COALESCE(SUM(l.inputTokens + l.outputTokens), 0) FROM AiUsageLog l WHERE l.user.userId = :userId AND l.createdAt >= :startDate")
    Integer sumTokensByUserSince(@Param("userId") Long userId, @Param("startDate") Instant startDate);
}
