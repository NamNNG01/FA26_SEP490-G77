package com.examprep.repositories;

import com.examprep.entities.ContestReward;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface ContestRewardRepository extends JpaRepository<ContestReward, Long> {
    List<ContestReward> findByContest_ContestId(Long contestId);
    Optional<ContestReward> findByRewardIdAndContest_ContestId(Long rewardId, Long contestId);
}
