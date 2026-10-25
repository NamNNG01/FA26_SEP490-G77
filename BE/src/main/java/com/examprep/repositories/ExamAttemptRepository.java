package com.examprep.repositories;

import com.examprep.dto.StudentRecentAttempt;
import com.examprep.entities.ExamAttempt;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface ExamAttemptRepository extends JpaRepository<ExamAttempt, Long> {
    boolean existsByExamExamId(Long examId);

    // Serialises SE-02 and the grading worker on one attempt's status. No join: FOR UPDATE would also lock the exam/course rows.
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT a FROM ExamAttempt a WHERE a.attemptId = :id")
    Optional<ExamAttempt> lockById(@Param("id") Long id);

    @Query("SELECT a FROM ExamAttempt a JOIN FETCH a.exam e JOIN FETCH e.course WHERE a.attemptId = :id")
    Optional<ExamAttempt> findWithExamById(@Param("id") Long id);

    @Query("SELECT COUNT(a) FROM ExamAttempt a WHERE a.user.userId = :userId")
    long countByUserId(@Param("userId") Long userId);

    @Query("SELECT AVG(a.totalScore) FROM ExamAttempt a WHERE a.user.userId = :userId AND a.totalScore IS NOT NULL")
    Number averageScoreByUserId(@Param("userId") Long userId);

    @Query("SELECT new com.examprep.dto.StudentRecentAttempt(a.attemptId, a.exam.examId, a.exam.title, a.totalScore, a.status, a.submitTime) " +
            "FROM ExamAttempt a " +
            "WHERE a.user.userId = :userId AND a.submitTime IS NOT NULL " +
            "ORDER BY a.submitTime DESC")
    List<StudentRecentAttempt> findRecentAttemptsByUserId(@Param("userId") Long userId, Pageable pageable);

    @Query("SELECT new com.examprep.dto.student.MyExamDto(" +
           "att.attemptId, ex.examId, ex.title, att.startTime, att.submittedAt, att.totalScore, ex.maxScore, att.status) " +
           "FROM ExamAttempt att JOIN att.exam ex " +
           "WHERE att.user.userId = :userId " +
           "ORDER BY att.startTime DESC")
    Page<com.examprep.dto.student.MyExamDto> findMyExams(@Param("userId") Long userId, Pageable pageable);

    @Query("SELECT att FROM ExamAttempt att WHERE att.exam.examId = :examId AND att.user.userId = :userId AND att.status = :status")
    Optional<ExamAttempt> findActiveAttempt(@Param("examId") Long examId, @Param("userId") Long userId, @Param("status") String status);

    /** SA-06: history of one exam for one student, newest attempt first, paged inside the database. */
    Page<ExamAttempt> findByUserUserIdAndExamExamIdOrderByStartTimeDescAttemptIdDesc(
            Long userId, Long examId, Pageable pageable);
}
