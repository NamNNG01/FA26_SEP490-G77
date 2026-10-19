package com.examprep.repositories;

import com.examprep.entities.AttemptAnswer;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface AttemptAnswerRepository extends JpaRepository<AttemptAnswer, Long> {
    boolean existsByQuestion_QuestionId(Long questionId);
    List<AttemptAnswer> findByAttempt_AttemptId(Long attemptId);
    List<AttemptAnswer> findByGradingStatus(String gradingStatus);
}
