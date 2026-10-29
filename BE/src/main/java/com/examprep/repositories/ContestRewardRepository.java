package com.examprep.repositories;

import com.examprep.entities.ContestReward;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.List;

@Repository
public interface ContestRewardRepository extends JpaRepository<ContestReward, Long> {

    @EntityGraph(attributePaths = "discount")
    List<ContestReward> findByContestContestIdOrderByRankPositionAsc(Long contestId);

    /** [contestId, rewards] */
    @Query("SELECT r.contest.contestId, COUNT(r) FROM ContestReward r WHERE r.contest.contestId IN :ids GROUP BY r.contest.contestId")
    List<Object[]> countByContests(@Param("ids") Collection<Long> ids);
}
