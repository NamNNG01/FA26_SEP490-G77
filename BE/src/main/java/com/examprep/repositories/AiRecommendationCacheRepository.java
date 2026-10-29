package com.examprep.repositories;

import com.examprep.entities.AiRecommendationCache;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface AiRecommendationCacheRepository extends JpaRepository<AiRecommendationCache, Long> {
    /** A null period matches rows whose period IS NULL (AI-03). */
    Optional<AiRecommendationCache> findFirstByStudentIdAndCourseIdAndTypeAndPeriod(Long studentId, Long courseId, String type, String period);
}
