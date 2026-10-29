package com.examprep.repositories;

import com.examprep.entities.AiRecommendationCache;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface AiRecommendationCacheRepository extends JpaRepository<AiRecommendationCache, Long> {
}
