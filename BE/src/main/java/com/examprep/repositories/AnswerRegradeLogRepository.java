package com.examprep.repositories;

import com.examprep.entities.AnswerRegradeLog;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface AnswerRegradeLogRepository extends JpaRepository<AnswerRegradeLog, Long> {
}
