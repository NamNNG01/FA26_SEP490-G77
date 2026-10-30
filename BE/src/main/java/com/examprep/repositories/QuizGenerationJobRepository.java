package com.examprep.repositories;

import com.examprep.entities.QuizGenerationJob;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

@Repository
public interface QuizGenerationJobRepository extends JpaRepository<QuizGenerationJob, Long> {

    Optional<QuizGenerationJob> findByJobIdAndUserUserId(Long jobId, Long userId);

    /** Serialises the PENDING → PROCESSING claim of one job. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select j from QuizGenerationJob j where j.jobId = :jobId")
    Optional<QuizGenerationJob> lockById(@Param("jobId") Long jobId);

    /** Restart recovery: rows left in one status without any update. */
    @Query("select j.jobId from QuizGenerationJob j where j.status = :status and j.updatedAt < :cutoff")
    List<Long> findIdsByStatusUpdatedBefore(@Param("status") String status, @Param("cutoff") Instant cutoff);

    /** Backs the 409 DUPLICATE_REQUEST rule: one active job per (student, document). */
    boolean existsByUserUserIdAndDocumentDocIdAndStatusIn(Long userId, Long docId, Collection<String> status);

    Page<QuizGenerationJob> findByUserUserIdOrderByCreatedAtDesc(Long userId, Pageable pageable);

    Page<QuizGenerationJob> findByUserUserIdAndStatusOrderByCreatedAtDesc(Long userId, String status, Pageable pageable);

    /** MQ-02: every job of one page of documents, one query. */
    List<QuizGenerationJob> findByUserUserIdAndDocumentDocIdInOrderByCreatedAtDesc(Long userId, Collection<Long> docIds);

    /** The job that generated an exam (a material quiz attempt carries it back as {@code quizJobId}). */
    Optional<QuizGenerationJob> findFirstByResultExamExamIdAndUserUserIdOrderByJobIdDesc(Long examId, Long userId);

    /** A deleted material takes its generation jobs with it. */
    @Modifying
    @Query("delete from QuizGenerationJob j where j.document.docId = :docId")
    int deleteByDocumentDocId(@Param("docId") Long docId);

    /** MQ-06: finished attempt statistics of generated quizzes, [examId, count, maxScore] per row. */
    @Query("SELECT a.exam.examId, COUNT(a), MAX(a.totalScore) FROM ExamAttempt a "
            + "WHERE a.user.userId = :userId AND a.exam.examId IN :examIds "
            + "AND a.status IN ('SUBMITTED', 'COMPLETED') GROUP BY a.exam.examId")
    List<Object[]> statsByExams(@Param("userId") Long userId, @Param("examIds") Collection<Long> examIds);
}
