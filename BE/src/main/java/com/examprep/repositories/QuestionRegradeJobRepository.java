package com.examprep.repositories;

import com.examprep.entities.AttemptAnswer;
import com.examprep.entities.QuestionRegradeJob;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface QuestionRegradeJobRepository extends JpaRepository<QuestionRegradeJob, Long> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT j FROM QuestionRegradeJob j JOIN FETCH j.issue WHERE j.jobId = :id")
    Optional<QuestionRegradeJob> lockById(@Param("id") Long id);

    boolean existsByQuestion_QuestionIdAndStatusIn(Long questionId, Collection<String> statuses);

    @EntityGraph(attributePaths = "confirmedBy")
    List<QuestionRegradeJob> findByIssue_IssueIdOrderByCreatedAtDescJobIdDesc(Long issueId);

    /** Answers of finished attempts still scored with an older version of the question. */
    @Query("""
            SELECT a FROM AttemptAnswer a JOIN FETCH a.attempt t
            WHERE a.question.questionId = :questionId AND t.status IN :statuses
              AND (a.questionVersion IS NULL OR a.questionVersion < :version)
            ORDER BY t.attemptId, a.attemptAnswerId
            """)
    List<AttemptAnswer> staleAnswers(@Param("questionId") Long questionId, @Param("statuses") Collection<String> statuses,
                                     @Param("version") Integer version);

    @Query("""
            SELECT COUNT(a) FROM AttemptAnswer a
            WHERE a.question.questionId = :questionId AND a.attempt.status IN :statuses
              AND (a.questionVersion IS NULL OR a.questionVersion < :version)
            """)
    long countStaleAnswers(@Param("questionId") Long questionId, @Param("statuses") Collection<String> statuses,
                           @Param("version") Integer version);

    @Query("SELECT a FROM AttemptAnswer a WHERE a.question.questionId = :questionId AND a.attempt.status = 'IN_PROGRESS'")
    List<AttemptAnswer> inProgressAnswers(@Param("questionId") Long questionId);
}
