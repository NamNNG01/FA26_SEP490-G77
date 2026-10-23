package com.examprep.repositories;

import com.examprep.entities.ExamQuestion;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.List;

@Repository
public interface ExamQuestionRepository extends JpaRepository<ExamQuestion, Long> {
    java.util.List<ExamQuestion> findByExamExamIdOrderByOrderIndexAscExamQuestionIdAsc(Long examId);
    java.util.Optional<ExamQuestion> findByExamExamIdAndQuestionQuestionId(Long examId, Long questionId);
    void deleteByExamExamId(Long examId);

    // Hàm từ nhánh của bạn
    List<ExamQuestion> findByQuestion_QuestionId(Long questionId);
    void deleteByQuestion_QuestionId(Long questionId);

    // Hàm từ người khác pull về
    @Query("SELECT COUNT(eq) FROM ExamQuestion eq " +
            "WHERE eq.question.group.groupId = :groupId AND eq.exam.status = :examStatus")
    long countByQuestionGroupIdAndExamStatus(@Param("groupId") Long groupId,
                                             @Param("examStatus") String examStatus);

    @Query("""
    SELECT DISTINCT eq
    FROM ExamQuestion eq
    JOIN FETCH eq.question q
    LEFT JOIN FETCH q.group
    WHERE eq.exam.examId IN :examIds
    ORDER BY eq.exam.examId, eq.orderIndex, eq.examQuestionId
    """)
    List<ExamQuestion> findAllByExamIds(
            @Param("examIds") Collection<Long> examIds
    );


}