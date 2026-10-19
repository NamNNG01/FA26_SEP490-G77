package com.examprep.repositories;

import com.examprep.entities.QuestionMedia;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface QuestionMediaRepository extends JpaRepository<QuestionMedia, Long> {
    List<QuestionMedia> findByQuestion_QuestionId(Long questionId);
}
