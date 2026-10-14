package com.examprep.repositories;

import com.examprep.entities.ContestReward;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface ContestRewardRepository extends JpaRepository<ContestReward, Long> {
}

