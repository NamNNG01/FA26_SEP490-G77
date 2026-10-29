package com.examprep.repositories;

import com.examprep.dto.student.PracticeDtos;
import com.examprep.dto.student.QuestionCandidate;
import com.examprep.entities.PracticeExam;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.List;

@Repository
public interface PracticeExamRepository extends JpaRepository<PracticeExam, Long> {

    /**
     * Questions a generated exam may use: active, approved, not deleted, not inside a passage group, of an
     * auto-graded type, in a visible module (or none). moduleIds is ignored when allModules is true.
     */
    @Query("SELECT new com.examprep.dto.student.QuestionCandidate(q.questionId, m.moduleId, m.title, q.difficulty, q.questionType, q.content) " +
            "FROM Question q LEFT JOIN q.module m " +
            "WHERE q.course.courseId = :courseId AND q.status = 'ACTIVE' AND q.approvalStatus = 'APPROVED' " +
            "AND q.deletedAt IS NULL AND q.group IS NULL AND q.questionType IN :types " +
            "AND (m IS NULL OR m.status <> 'HIDDEN') " +
            "AND (:allModules = true OR m.moduleId IN :moduleIds) " +
            "AND (:difficulty IS NULL OR q.difficulty = :difficulty)")
    List<QuestionCandidate> findCandidates(@Param("courseId") Long courseId, @Param("types") Collection<String> types,
                                           @Param("allModules") boolean allModules, @Param("moduleIds") Collection<Long> moduleIds,
                                           @Param("difficulty") String difficulty);

    @Query(value = "SELECT new com.examprep.dto.student.PracticeDtos$Item(p.practiceExamId, p.examId, p.title, p.questionCount, " +
            "p.durationMinutes, " +
            "(SELECT MAX(a.totalScore) FROM ExamAttempt a WHERE a.exam.examId = p.examId AND a.user.userId = :userId), " +
            "(SELECT COUNT(a) FROM ExamAttempt a WHERE a.exam.examId = p.examId AND a.user.userId = :userId), p.createdAt) " +
            "FROM PracticeExam p WHERE p.userId = :userId ORDER BY p.createdAt DESC, p.practiceExamId DESC",
            countQuery = "SELECT COUNT(p) FROM PracticeExam p WHERE p.userId = :userId")
    Page<PracticeDtos.Item> findMine(@Param("userId") Long userId, Pageable pageable);
}
