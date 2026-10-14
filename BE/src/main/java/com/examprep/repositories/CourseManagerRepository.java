package com.examprep.repositories;

import com.examprep.entities.CourseManager;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface CourseManagerRepository extends JpaRepository<CourseManager, Long> {
}

