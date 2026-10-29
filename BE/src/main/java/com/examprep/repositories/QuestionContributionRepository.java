package com.examprep.repositories;

import com.examprep.entities.QuestionContribution;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

@Repository
public interface QuestionContributionRepository extends JpaRepository<QuestionContribution, Long> {

    @Query("SELECT c FROM QuestionContribution c WHERE c.userId = :userId " +
           "AND (:type IS NULL OR c.type = :type) " +
           "AND (:status IS NULL OR c.status = :status) " +
           "ORDER BY c.submittedAt DESC")
    Page<QuestionContribution> findByStudentAndFilters(
            @Param("userId") Long userId,
            @Param("type") String type,
            @Param("status") String status,
            Pageable pageable
    );
}
