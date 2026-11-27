package com.examprep.repositories;

import com.examprep.entities.QuestionPracticeDeepExplanation;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface QuestionPracticeDeepExplanationRepository extends JpaRepository<QuestionPracticeDeepExplanation, Long> {
    @Query("SELECT d.explanation FROM QuestionPracticeDeepExplanation d WHERE d.practiceAnswerId = :id")
    Optional<String> findExplanationById(@Param("id") Long id);
}
