package com.examprep.repositories;

import com.examprep.entities.ExamGroup;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface ExamGroupRepository extends JpaRepository<ExamGroup, Long> {
}

