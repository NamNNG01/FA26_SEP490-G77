package com.examprep.repositories;

import com.examprep.entities.QuestionPracticeDeepExplanation;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface QuestionPracticeDeepExplanationRepository extends JpaRepository<QuestionPracticeDeepExplanation, Long> {
}
