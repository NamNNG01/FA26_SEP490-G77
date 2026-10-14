package com.examprep.repositories;

import com.examprep.entities.AttemptAnswer;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface AttemptAnswerRepository extends JpaRepository<AttemptAnswer, Long> {
}

