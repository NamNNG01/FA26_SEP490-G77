package com.examprep.repositories;

import com.examprep.entities.AiPersonalizationJob;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;

@Repository
public interface AiPersonalizationJobRepository extends JpaRepository<AiPersonalizationJob, Long> {
    List<AiPersonalizationJob> findByStatusAndExpiresAtBefore(String status, Instant now);
}
