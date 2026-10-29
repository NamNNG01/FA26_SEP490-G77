package com.examprep.repositories;

import com.examprep.entities.ContestParticipant;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.List;

@Repository
public interface ContestParticipantRepository extends JpaRepository<ContestParticipant, Long> {

    /** [contestId, participants] */
    @Query("SELECT p.contest.contestId, COUNT(p) FROM ContestParticipant p WHERE p.contest.contestId IN :ids GROUP BY p.contest.contestId")
    List<Object[]> countByContests(@Param("ids") Collection<Long> ids);

    long countByContestContestId(Long contestId);

    @EntityGraph(attributePaths = "user")
    List<ContestParticipant> findByContestContestIdOrderByParticipantIdAsc(Long contestId);

    /** Ranked rows only, best first (API 8). */
    @EntityGraph(attributePaths = "user")
    @Query("SELECT p FROM ContestParticipant p WHERE p.contest.contestId = :id AND p.rank IS NOT NULL ORDER BY p.rank, p.participantId")
    Page<ContestParticipant> findRanked(@Param("id") Long contestId, Pageable pageable);
}
