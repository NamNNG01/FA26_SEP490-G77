package com.examprep.repositories;

import com.examprep.entities.ContestParticipant;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface ContestParticipantRepository extends JpaRepository<ContestParticipant, Long> {
    boolean existsByContest_ContestIdAndUser_UserId(Long contestId, Long userId);
    long countByContest_ContestId(Long contestId);
    Optional<ContestParticipant> findByContest_ContestIdAndUser_UserId(Long contestId, Long userId);
    List<ContestParticipant> findByContest_ContestIdOrderByScoreDescFinishedAtAsc(Long contestId);
    Page<ContestParticipant> findByUser_UserIdOrderByJoinedAtDesc(Long userId, Pageable pageable);
}
