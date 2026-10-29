package com.examprep.repositories;

import com.examprep.entities.CodeQuestionConfig;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface CodeQuestionConfigRepository extends JpaRepository<CodeQuestionConfig, Long> {
}
