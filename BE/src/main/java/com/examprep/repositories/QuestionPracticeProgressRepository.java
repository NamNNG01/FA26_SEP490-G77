package com.examprep.repositories;

import com.examprep.entities.QuestionPracticeProgress;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface QuestionPracticeProgressRepository extends JpaRepository<QuestionPracticeProgress, Long> {

    Optional<QuestionPracticeProgress> findByUser_UserIdAndModule_ModuleIdAndQuestion_QuestionId(
            Long userId, Long moduleId, Long questionId);

    /**
     * Locks the progress row while it is rebuilt, so two writers of the same
     * (student, module, question) — a submit and a late AI grade, possibly in two different sessions
     * — cannot lose each other's update. An absent row is a miss, not an error.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT p FROM QuestionPracticeProgress p WHERE p.user.userId = :userId "
            + "AND p.module.moduleId = :moduleId AND p.question.questionId = :questionId")
    Optional<QuestionPracticeProgress> lockByUserModuleQuestion(@Param("userId") Long userId,
                                                                @Param("moduleId") Long moduleId,
                                                                @Param("questionId") Long questionId);

    /** The General pool's progress row of one student and question ({@code uq_qpp_user_course_question_general}). */
    @Query("SELECT p FROM QuestionPracticeProgress p WHERE p.user.userId = :userId "
            + "AND p.course.courseId = :courseId AND p.module IS NULL AND p.question.questionId = :questionId")
    Optional<QuestionPracticeProgress> findGeneralByUserCourseQuestion(@Param("userId") Long userId,
                                                                      @Param("courseId") Long courseId,
                                                                      @Param("questionId") Long questionId);

    /** The same row lock, for a question that carries no module. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT p FROM QuestionPracticeProgress p WHERE p.user.userId = :userId "
            + "AND p.course.courseId = :courseId AND p.module IS NULL AND p.question.questionId = :questionId")
    Optional<QuestionPracticeProgress> lockByUserCourseQuestion(@Param("userId") Long userId,
                                                                @Param("courseId") Long courseId,
                                                                @Param("questionId") Long questionId);

    /**
     * MP-01 overview, one grouped query per module. Rows come back as
     * {@code [practicedQuestions, totalAttempts, gradedAttempts, correctAttempts, wrongAttempts,
     * everCorrectQuestions, reviewQuestions]}. A question counts as practised once it has at least one
     * attempt; a progress row without an attempt exists only when a session's paper was cleaned up.
     */
    @Query("SELECT COALESCE(SUM(CASE WHEN p.totalAttempts > 0 THEN 1 ELSE 0 END), 0), "
            + "COALESCE(SUM(p.totalAttempts), 0), "
            + "COALESCE(SUM(p.gradedAttempts), 0), "
            + "COALESCE(SUM(p.correctAttempts), 0), "
            + "COALESCE(SUM(p.wrongAttempts), 0), "
            + "COALESCE(SUM(CASE WHEN p.correctAttempts > 0 THEN 1 ELSE 0 END), 0), "
            + "COALESCE(SUM(CASE WHEN p.masteryStatus = 'LEARNING' THEN 1 ELSE 0 END), 0) "
            + "FROM QuestionPracticeProgress p "
            + "WHERE p.user.userId = :userId AND p.module.moduleId = :moduleId")
    List<Object[]> summarizeModule(@Param("userId") Long userId, @Param("moduleId") Long moduleId);

    /** MP-01 (General): the same grouped summary over the course's module-less progress rows. */
    @Query("SELECT COALESCE(SUM(CASE WHEN p.totalAttempts > 0 THEN 1 ELSE 0 END), 0), "
            + "COALESCE(SUM(p.totalAttempts), 0), "
            + "COALESCE(SUM(p.gradedAttempts), 0), "
            + "COALESCE(SUM(p.correctAttempts), 0), "
            + "COALESCE(SUM(p.wrongAttempts), 0), "
            + "COALESCE(SUM(CASE WHEN p.correctAttempts > 0 THEN 1 ELSE 0 END), 0), "
            + "COALESCE(SUM(CASE WHEN p.masteryStatus = 'LEARNING' THEN 1 ELSE 0 END), 0) "
            + "FROM QuestionPracticeProgress p "
            + "WHERE p.user.userId = :userId AND p.course.courseId = :courseId AND p.module IS NULL")
    List<Object[]> summarizeCourse(@Param("userId") Long userId, @Param("courseId") Long courseId);

    /**
     * MP-11: the questions of one module the student should practise again — the latest finalized
     * attempt is wrong. Only questions that are still deliverable <em>and</em> still belong to this
     * module are listed, so the page can never offer something a REVIEW session could not deliver.
     */
    @Query(value = "SELECT p FROM QuestionPracticeProgress p JOIN FETCH p.question q "
            + "WHERE p.user.userId = :userId AND p.module.moduleId = :moduleId "
            + "AND p.masteryStatus = 'LEARNING' "
            + "AND q.deletedAt IS NULL AND q.status = 'ACTIVE' AND q.approvalStatus = 'APPROVED' "
            + "AND q.sourceDocumentId IS NULL AND q.module.moduleId = :moduleId "
            + "ORDER BY p.wrongAttempts DESC, p.lastAnsweredAt ASC",
            countQuery = "SELECT COUNT(p) FROM QuestionPracticeProgress p JOIN p.question q "
                    + "WHERE p.user.userId = :userId AND p.module.moduleId = :moduleId "
                    + "AND p.masteryStatus = 'LEARNING' "
                    + "AND q.deletedAt IS NULL AND q.status = 'ACTIVE' AND q.approvalStatus = 'APPROVED' "
                    + "AND q.sourceDocumentId IS NULL AND q.module.moduleId = :moduleId")
    Page<QuestionPracticeProgress> findReviewQuestions(@Param("userId") Long userId,
                                                       @Param("moduleId") Long moduleId,
                                                       Pageable pageable);

    /** MP-11 (REVIEW mode): the ids of the same list, without paging, for session creation. */
    @Query("SELECT p.question.questionId FROM QuestionPracticeProgress p JOIN p.question q "
            + "WHERE p.user.userId = :userId AND p.module.moduleId = :moduleId "
            + "AND p.masteryStatus = 'LEARNING' "
            + "AND q.deletedAt IS NULL AND q.status = 'ACTIVE' AND q.approvalStatus = 'APPROVED' "
            + "AND q.sourceDocumentId IS NULL AND q.module.moduleId = :moduleId "
            + "ORDER BY p.wrongAttempts DESC, p.lastAnsweredAt ASC")
    List<Long> findReviewQuestionIds(@Param("userId") Long userId, @Param("moduleId") Long moduleId);

    /**
     * MP-11 (General): the course's module-less questions whose latest finalized attempt is wrong,
     * paged. Only questions still in the General pool are listed, so the page can never offer
     * something a General REVIEW session could not deliver.
     */
    @Query(value = "SELECT p FROM QuestionPracticeProgress p JOIN FETCH p.question q "
            + "WHERE p.user.userId = :userId AND p.course.courseId = :courseId AND p.module IS NULL "
            + "AND p.masteryStatus = 'LEARNING' "
            + "AND q.deletedAt IS NULL AND q.status = 'ACTIVE' AND q.approvalStatus = 'APPROVED' "
            + "AND q.sourceDocumentId IS NULL AND q.course.courseId = :courseId AND q.module IS NULL "
            + "ORDER BY p.wrongAttempts DESC, p.lastAnsweredAt ASC",
            countQuery = "SELECT COUNT(p) FROM QuestionPracticeProgress p JOIN p.question q "
                    + "WHERE p.user.userId = :userId AND p.course.courseId = :courseId AND p.module IS NULL "
                    + "AND p.masteryStatus = 'LEARNING' "
                    + "AND q.deletedAt IS NULL AND q.status = 'ACTIVE' AND q.approvalStatus = 'APPROVED' "
                    + "AND q.sourceDocumentId IS NULL AND q.course.courseId = :courseId AND q.module IS NULL")
    Page<QuestionPracticeProgress> findGeneralReviewQuestions(@Param("userId") Long userId,
                                                             @Param("courseId") Long courseId,
                                                             Pageable pageable);

    /** MP-11 (General, REVIEW mode): the ids of the same list, without paging. */
    @Query("SELECT p.question.questionId FROM QuestionPracticeProgress p JOIN p.question q "
            + "WHERE p.user.userId = :userId AND p.course.courseId = :courseId AND p.module IS NULL "
            + "AND p.masteryStatus = 'LEARNING' "
            + "AND q.deletedAt IS NULL AND q.status = 'ACTIVE' AND q.approvalStatus = 'APPROVED' "
            + "AND q.sourceDocumentId IS NULL AND q.course.courseId = :courseId AND q.module IS NULL "
            + "ORDER BY p.wrongAttempts DESC, p.lastAnsweredAt ASC")
    List<Long> findReviewQuestionIdsGeneral(@Param("userId") Long userId, @Param("courseId") Long courseId);

    /** MP-12: the reset removes exactly the student's own progress rows of one module. */
    @Modifying
    @Query("DELETE FROM QuestionPracticeProgress p "
            + "WHERE p.user.userId = :userId AND p.module.moduleId = :moduleId")
    int deleteByUserIdAndModuleId(@Param("userId") Long userId, @Param("moduleId") Long moduleId);

    /** MP-12 (General): exactly the student's module-less progress rows of one course. */
    @Modifying
    @Query("DELETE FROM QuestionPracticeProgress p "
            + "WHERE p.user.userId = :userId AND p.course.courseId = :courseId AND p.module IS NULL")
    int deleteGeneralByUserIdAndCourseId(@Param("userId") Long userId, @Param("courseId") Long courseId);
}
