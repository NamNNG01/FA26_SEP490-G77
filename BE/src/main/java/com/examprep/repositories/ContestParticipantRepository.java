package com.examprep.repositories;

import com.examprep.entities.ContestParticipant;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface ContestParticipantRepository extends JpaRepository<ContestParticipant, Long> {
}

