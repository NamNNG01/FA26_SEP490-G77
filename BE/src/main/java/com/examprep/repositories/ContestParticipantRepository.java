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
import java.util.Optional;

@Repository
public interface ContestParticipantRepository extends JpaRepository<ContestParticipant, Long> {

    /** [contestId, participants] */
    @Query("SELECT p.contest.contestId, COUNT(p) FROM ContestParticipant p WHERE p.contest.contestId IN :ids GROUP BY p.contest.contestId")
    List<Object[]> countByContests(@Param("ids") Collection<Long> ids);

    long countByContestContestId(Long contestId);

    @EntityGraph(attributePaths = "user")
    List<ContestParticipant> findByContestContestIdOrderByParticipantIdAsc(Long contestId);

    @Query("SELECT a FROM ExamAttempt a WHERE a.attemptId IN :ids")
    List<com.examprep.entities.ExamAttempt> findAttempts(@Param("ids") Collection<Long> attemptIds);

    /** Attempts still being written or graded block ranking (section 6.3 step 1). */
    @Query("SELECT COUNT(a) FROM ExamAttempt a WHERE a.attemptId IN :ids AND a.status IN ('IN_PROGRESS', 'GRADING')")
    long countUnfinishedAttempts(@Param("ids") Collection<Long> attemptIds);

    @Query("SELECT COUNT(aa) FROM AttemptAnswer aa WHERE aa.attempt.attemptId IN :ids AND aa.gradingStatus IN ('PENDING', 'PENDING_AI', 'GRADING')")
    long countPendingGrading(@Param("ids") Collection<Long> attemptIds);

    /** Ranked rows only, best first (API 8). */
    @EntityGraph(attributePaths = "user")
    @Query("SELECT p FROM ContestParticipant p WHERE p.contest.contestId = :id AND p.rank IS NOT NULL ORDER BY p.rank, p.participantId")
    Page<ContestParticipant> findRanked(@Param("id") Long contestId, Pageable pageable);

    boolean existsByContest_ContestIdAndUser_UserId(Long contestId, Long userId);
    long countByContest_ContestId(Long contestId);
    Optional<ContestParticipant> findByContest_ContestIdAndUser_UserId(Long contestId, Long userId);
    List<ContestParticipant> findByContest_ContestIdOrderByScoreDescFinishedAtAsc(Long contestId);
    Page<ContestParticipant> findByUser_UserIdOrderByJoinedAtDesc(Long userId, Pageable pageable);
}
