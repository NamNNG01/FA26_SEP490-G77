package com.examprep.repositories;

import com.examprep.entities.AiPersonalizationJob;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface AiPersonalizationJobRepository extends JpaRepository<AiPersonalizationJob, Long> {
}
