package com.examprep.repositories;

import com.examprep.entities.AiPersonalizationJob;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

@Repository
public interface AiPersonalizationJobRepository extends JpaRepository<AiPersonalizationJob, Long> {
    List<AiPersonalizationJob> findByStatusAndExpiresAtBefore(String status, Instant now);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT j FROM AiPersonalizationJob j WHERE j.jobId = :jobId")
    Optional<AiPersonalizationJob> lockById(@Param("jobId") Long jobId);
}
