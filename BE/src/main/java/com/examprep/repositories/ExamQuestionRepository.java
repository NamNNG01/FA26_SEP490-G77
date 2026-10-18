package com.examprep.repositories;

import com.examprep.entities.ExamQuestion;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

@Repository
public interface ExamQuestionRepository extends JpaRepository<ExamQuestion, Long> {

    @Query("SELECT COUNT(eq) FROM ExamQuestion eq " +
            "WHERE eq.question.group.groupId = :groupId AND eq.exam.status = :examStatus")
    long countByQuestionGroupIdAndExamStatus(@Param("groupId") Long groupId,
                                             @Param("examStatus") String examStatus);
}

