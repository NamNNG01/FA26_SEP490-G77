package com.examprep.repositories;

import com.examprep.entities.ManagerExplanationJob;
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
public interface ManagerExplanationJobRepository extends JpaRepository<ManagerExplanationJob, Long> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT j FROM ManagerExplanationJob j WHERE j.jobId = :jobId")
    Optional<ManagerExplanationJob> lockById(@Param("jobId") Long jobId);

    @Query("SELECT j.jobId FROM ManagerExplanationJob j WHERE j.status = :status AND j.updatedAt < :cutoff")
    List<Long> findIdsByStatusUpdatedBefore(@Param("status") String status, @Param("cutoff") Instant cutoff);
}
