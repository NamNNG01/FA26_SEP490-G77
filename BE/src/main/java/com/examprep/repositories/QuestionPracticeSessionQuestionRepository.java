package com.examprep.repositories;

import com.examprep.entities.QuestionPracticeSessionQuestion;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface QuestionPracticeSessionQuestionRepository
        extends JpaRepository<QuestionPracticeSessionQuestion, Long> {

    /** The frozen paper in its persisted, never re-randomized order. */
    @Query("SELECT sq FROM QuestionPracticeSessionQuestion sq JOIN FETCH sq.question "
            + "WHERE sq.session.sessionId = :sessionId ORDER BY sq.orderIndex")
    List<QuestionPracticeSessionQuestion> findPaperBySessionId(@Param("sessionId") Long sessionId);

    /** MP-04: one paper row, scoped to its session so a foreign id cannot be probed. */
    @Query("SELECT sq FROM QuestionPracticeSessionQuestion sq JOIN FETCH sq.question "
            + "WHERE sq.sessionQuestionId = :sessionQuestionId AND sq.session.sessionId = :sessionId")
    Optional<QuestionPracticeSessionQuestion> findInSession(@Param("sessionId") Long sessionId,
                                                            @Param("sessionQuestionId") Long sessionQuestionId);

    /**
     * MP-05: locking the paper row before an attempt allocates the next {@code attempt_number} keeps
     * concurrent submits of the same question strictly serialized.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT sq FROM QuestionPracticeSessionQuestion sq JOIN FETCH sq.question "
            + "WHERE sq.sessionQuestionId = :sessionQuestionId AND sq.session.sessionId = :sessionId")
    Optional<QuestionPracticeSessionQuestion> lockInSession(@Param("sessionId") Long sessionId,
                                                            @Param("sessionQuestionId") Long sessionQuestionId);

    /** MP-09: the paper row the explanation endpoint was asked about. */
    Optional<QuestionPracticeSessionQuestion> findBySession_SessionIdAndQuestion_QuestionId(Long sessionId,
                                                                                            Long questionId);

    /** MP-03: how many questions of the paper have been answered at least once. */
    @Query("SELECT COUNT(sq) FROM QuestionPracticeSessionQuestion sq "
            + "WHERE sq.session.sessionId = :sessionId AND sq.attemptCount > 0")
    long countAnswered(@Param("sessionId") Long sessionId);

    /** MP-03/MP-08: questions whose latest result is correct. */
    @Query("SELECT COUNT(sq) FROM QuestionPracticeSessionQuestion sq "
            + "WHERE sq.session.sessionId = :sessionId AND sq.latestIsCorrect = TRUE")
    long countLatestCorrect(@Param("sessionId") Long sessionId);

    /** MP-03: the first unanswered question of the persisted order, if any is left. */
    @Query("SELECT sq FROM QuestionPracticeSessionQuestion sq "
            + "WHERE sq.session.sessionId = :sessionId AND sq.attemptCount = 0 "
            + "ORDER BY sq.orderIndex")
    List<QuestionPracticeSessionQuestion> findUnansweredOrdered(@Param("sessionId") Long sessionId,
                                                                org.springframework.data.domain.Pageable pageable);

}
