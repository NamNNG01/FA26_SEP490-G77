package com.examprep.repositories;

import com.examprep.entities.ContestReward;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

@Repository
public interface ContestRewardRepository extends JpaRepository<ContestReward, Long> {

    @EntityGraph(attributePaths = {"discount", "contest"})
    List<ContestReward> findByDiscount_DiscountIdOrderByRankPositionAsc(Long discountId);

    @EntityGraph(attributePaths = {"discount", "contest"})
    @Query("SELECT r FROM ContestReward r JOIN r.contest c " +
            "WHERE r.discount.discountId = :discountId " +
            "AND c.deletedAt IS NULL " +
            "AND c.status NOT IN ('CANCELLED', 'REWARDED')")
    List<ContestReward> findActiveByDiscountId(@Param("discountId") Long discountId);

    @Query("SELECT CASE WHEN COUNT(r) > 0 THEN true ELSE false END FROM ContestReward r JOIN r.contest c " +
            "WHERE r.discount.discountId = :discountId " +
            "AND c.deletedAt IS NULL " +
            "AND c.status NOT IN ('CANCELLED', 'REWARDED')")
    boolean existsActiveByDiscountId(@Param("discountId") Long discountId);

    @EntityGraph(attributePaths = "discount")
    List<ContestReward> findByContestContestIdOrderByRankPositionAsc(Long contestId);

    /** [contestId, rewards] */
    @Query("SELECT r.contest.contestId, COUNT(r) FROM ContestReward r WHERE r.contest.contestId IN :ids GROUP BY r.contest.contestId")
    List<Object[]> countByContests(@Param("ids") Collection<Long> ids);

    @EntityGraph(attributePaths = "discount")
    List<ContestReward> findByContest_ContestId(Long contestId);

    @EntityGraph(attributePaths = "discount")
    List<ContestReward> findByContest_ContestIdIn(Collection<Long> contestIds);

    Optional<ContestReward> findByRewardIdAndContest_ContestId(Long rewardId, Long contestId);
}
