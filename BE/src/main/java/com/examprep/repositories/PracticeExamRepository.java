package com.examprep.repositories;

import com.examprep.entities.PracticeExam;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface PracticeExamRepository extends JpaRepository<PracticeExam, Long> {
}
