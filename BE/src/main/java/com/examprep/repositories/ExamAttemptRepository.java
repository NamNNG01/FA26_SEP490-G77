package com.examprep.repositories;

import com.examprep.dto.StudentRecentAttempt;
import com.examprep.entities.ExamAttempt;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface ExamAttemptRepository extends JpaRepository<ExamAttempt, Long> {
    boolean existsByExamExamId(Long examId);

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
}
