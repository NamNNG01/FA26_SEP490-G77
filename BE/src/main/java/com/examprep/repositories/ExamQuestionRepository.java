package com.examprep.repositories;

import com.examprep.entities.ExamQuestion;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface ExamQuestionRepository extends JpaRepository<ExamQuestion, Long> {
    List<ExamQuestion> findByQuestion_QuestionId(Long questionId);
    void deleteByQuestion_QuestionId(Long questionId);
}

