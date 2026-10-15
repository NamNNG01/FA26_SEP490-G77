package com.examprep.repositories;

import com.examprep.entities.AttemptAnswerOption;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface AttemptAnswerOptionRepository extends JpaRepository<AttemptAnswerOption, Long> {
}
