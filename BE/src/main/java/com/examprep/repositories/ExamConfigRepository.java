package com.examprep.repositories;

import com.examprep.entities.ExamConfig;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface ExamConfigRepository extends JpaRepository<ExamConfig, Long> {
}

