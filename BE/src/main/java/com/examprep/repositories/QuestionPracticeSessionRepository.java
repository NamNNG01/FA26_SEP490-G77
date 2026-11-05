package com.examprep.repositories;

import com.examprep.entities.QuestionPracticeSession;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface QuestionPracticeSessionRepository extends JpaRepository<QuestionPracticeSession, Long> {

    /**
     * MP-02 … MP-08: the session as the student owns it. A session of another student is
     * indistinguishable from a missing one, so ownership is never leaked.
     */
    @Query("SELECT s FROM QuestionPracticeSession s "
            + "LEFT JOIN FETCH s.module m "
            + "JOIN FETCH s.course c "
            + "JOIN FETCH s.user u "
            + "WHERE s.sessionId = :sessionId AND s.user.userId = :userId")
    Optional<QuestionPracticeSession> findOwned(@Param("sessionId") Long sessionId, @Param("userId") Long userId);

    /**
     * The write path locks the session row first, so two concurrent submits of the same session can
     * never interleave their counter updates.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT s FROM QuestionPracticeSession s "
            + "LEFT JOIN FETCH s.module m "
            + "JOIN FETCH s.course c "
            + "JOIN FETCH s.user u "
            + "WHERE s.sessionId = :sessionId AND s.user.userId = :userId")
    Optional<QuestionPracticeSession> lockOwned(@Param("sessionId") Long sessionId, @Param("userId") Long userId);

    /** The AI grading worker refreshes the counters of the session that owns the answer. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT s FROM QuestionPracticeSession s WHERE s.sessionId = :sessionId")
    Optional<QuestionPracticeSession> lockById(@Param("sessionId") Long sessionId);

    /** The single open run of one student on one module (partial unique index backs this). */
    Optional<QuestionPracticeSession> findFirstByUser_UserIdAndModule_ModuleIdAndStatusOrderBySessionIdDesc(
            Long userId, Long moduleId, String status);

    /** The single open General run of one student in one course (uq_qps_one_active_general backs this). */
    Optional<QuestionPracticeSession> findFirstByUser_UserIdAndCourse_CourseIdAndModuleIsNullAndStatusOrderBySessionIdDesc(
            Long userId, Long courseId, String status);

    /**
     * MP-12: the reset removes every practice session of one student on one module. The database
     * cascades into {@code question_practice_session_questions} and {@code question_practice_answers};
     * no question of the shared bank and no other student's row is affected.
     */
    @Modifying
    @Query("DELETE FROM QuestionPracticeSession s "
            + "WHERE s.user.userId = :userId AND s.module.moduleId = :moduleId")
    int deleteByUserIdAndModuleId(@Param("userId") Long userId, @Param("moduleId") Long moduleId);

    /**
     * MP-12 (General): the reset removes every General session of one student in one course. Module
     * runs of the same course are untouched, and the database cascades into the frozen paper and
     * every stored attempt of the deleted sessions.
     */
    @Modifying
    @Query("DELETE FROM QuestionPracticeSession s "
            + "WHERE s.user.userId = :userId AND s.course.courseId = :courseId AND s.module IS NULL")
    int deleteGeneralByUserIdAndCourseId(@Param("userId") Long userId, @Param("courseId") Long courseId);
}
