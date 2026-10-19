package com.examprep.repositories;

import com.examprep.entities.QuestionReview;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface QuestionReviewRepository extends JpaRepository<QuestionReview, Long> {
    List<QuestionReview> findByQuestion_QuestionId(Long questionId);
}
