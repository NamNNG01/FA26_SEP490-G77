package com.examprep.repositories;

import com.examprep.entities.SubscriptionPlan;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface SubscriptionPlanRepository extends JpaRepository<SubscriptionPlan, Long> {
    List<SubscriptionPlan> findByIsActiveTrueAndDeletedAtIsNullOrderBySortOrderAscPlanIdAsc();
    Optional<SubscriptionPlan> findByPlanIdAndIsActiveTrueAndDeletedAtIsNull(Long planId);
    @Query("select p from SubscriptionPlan p where p.planId = :id and p.deletedAt is null")
    Optional<SubscriptionPlan> findAvailable(@Param("id") Long id);
}
