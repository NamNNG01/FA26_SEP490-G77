package com.examprep.repositories;

import com.examprep.entities.AnswerOption;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface AnswerOptionRepository extends JpaRepository<AnswerOption, Long> {
    List<AnswerOption> findByQuestion_QuestionId(Long questionId);
    java.util.List<AnswerOption> findByQuestionQuestionIdOrderByOrderIndexAscOptionIdAsc(Long questionId);
}

