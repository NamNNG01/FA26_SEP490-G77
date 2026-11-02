package com.examprep.repositories;

import com.examprep.entities.ReviewLog;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface ReviewLogRepository extends JpaRepository<ReviewLog, Long> {
    List<ReviewLog> findByTargetTypeAndTargetIdOrderByCreatedAtDesc(String targetType, Long targetId);
}
