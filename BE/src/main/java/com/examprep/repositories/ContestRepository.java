package com.examprep.repositories;

import com.examprep.entities.Contest;
import com.examprep.entities.Exam;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

@Repository
public interface ContestRepository extends JpaRepository<Contest, Long>, JpaSpecificationExecutor<Contest> {

    @Override
    @EntityGraph(attributePaths = {"course", "exam"})
    Page<Contest> findAll(Specification<Contest> spec, Pageable pageable);

    @EntityGraph(attributePaths = {"course", "exam", "rewardedBy"})
    @Query("SELECT c FROM Contest c WHERE c.contestId = :id AND c.deletedAt IS NULL")
    Optional<Contest> findLive(@Param("id") Long id);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT c FROM Contest c WHERE c.contestId = :id AND c.deletedAt IS NULL")
    Optional<Contest> findForUpdate(@Param("id") Long id);

    /** Contests that still hold this exam (not cancelled, not rewarded, not deleted), other than excludeId. */
    @Query("SELECT COUNT(c) FROM Contest c WHERE c.exam.examId = :examId AND c.deletedAt IS NULL " +
            "AND c.status NOT IN ('CANCELLED', 'REWARDED') AND c.contestId <> :excludeId")
    long countActiveForExam(@Param("examId") Long examId, @Param("excludeId") Long excludeId);

    /** API 11: exams of the course that may start a contest (spec rules 2 and 3, plus quiz-only: no ESSAY/CODE/DIAGRAM). */
    @Query(value = "SELECT e FROM Exam e WHERE e.course.courseId = :courseId AND e.status = 'PUBLISHED' AND e.isPractice = false " +
            "AND e.mode = 'EXAM' AND LOWER(e.title) LIKE :keyword ESCAPE '!' AND NOT EXISTS (SELECT c FROM Contest c WHERE c.exam = e " +
            "AND c.deletedAt IS NULL AND c.status NOT IN ('CANCELLED', 'REWARDED')) " +
            "AND NOT EXISTS (SELECT eq FROM ExamQuestion eq WHERE eq.exam = e AND eq.question.questionType IN ('ESSAY', 'CODE', 'DIAGRAM')) " +
            "AND NOT EXISTS (SELECT ec FROM ExamConfig ec WHERE ec.exam = e AND ec.questionType IN ('ESSAY', 'CODE', 'DIAGRAM')) ORDER BY e.publishedAt DESC, e.examId DESC",
            countQuery = "SELECT COUNT(e) FROM Exam e WHERE e.course.courseId = :courseId AND e.status = 'PUBLISHED' AND e.isPractice = false " +
            "AND e.mode = 'EXAM' AND LOWER(e.title) LIKE :keyword ESCAPE '!' AND NOT EXISTS (SELECT c FROM Contest c WHERE c.exam = e " +
            "AND c.deletedAt IS NULL AND c.status NOT IN ('CANCELLED', 'REWARDED')) " +
            "AND NOT EXISTS (SELECT eq FROM ExamQuestion eq WHERE eq.exam = e AND eq.question.questionType IN ('ESSAY', 'CODE', 'DIAGRAM')) " +
            "AND NOT EXISTS (SELECT ec FROM ExamConfig ec WHERE ec.exam = e AND ec.questionType IN ('ESSAY', 'CODE', 'DIAGRAM'))")
    Page<Exam> findEligibleExams(@Param("courseId") Long courseId, @Param("keyword") String keyword, Pageable pageable);

    /** [examId, randomly drawn question count] of exams with random rules. */
    @Query("SELECT c.exam.examId, SUM(c.numberOfQuestions) FROM ExamConfig c WHERE c.exam.examId IN :ids GROUP BY c.exam.examId")
    List<Object[]> randomQuestionCounts(@Param("ids") java.util.Collection<Long> examIds);

    /** Ranking scheduler (section 6.3): ended, published, not ranked yet. */
    @Query("SELECT c.contestId FROM Contest c WHERE c.status = 'PUBLISHED' AND c.deletedAt IS NULL AND c.rankedAt IS NULL " +
            "AND c.endTime <= :now ORDER BY c.endTime")
    List<Long> findDueForRanking(@Param("now") Instant now);

    /** Reminder scheduler: published contests starting in (now, until] that were not reminded yet. */
    @Query("SELECT c.contestId FROM Contest c WHERE c.status = 'PUBLISHED' AND c.deletedAt IS NULL AND c.reminderSentAt IS NULL " +
            "AND c.startTime > :now AND c.startTime <= :until ORDER BY c.startTime")
    List<Long> findDueForReminder(@Param("now") Instant now, @Param("until") Instant until);
}
