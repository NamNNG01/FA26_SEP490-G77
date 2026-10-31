package com.examprep.repositories;

import com.examprep.entities.UserSubscription;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

@Repository
public interface UserSubscriptionRepository extends JpaRepository<UserSubscription, Long> {

    @Query("SELECT s FROM UserSubscription s JOIN FETCH s.plan WHERE s.user.userId = :userId AND s.status = 'ACTIVE' AND s.startDate <= :now AND s.endDate >= :now")
    Optional<UserSubscription> findActiveSubscriptionByUser(@Param("userId") Long userId, @Param("now") Instant now);

    @org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT s FROM UserSubscription s JOIN FETCH s.plan WHERE s.user.userId = :userId AND s.status = 'ACTIVE' AND s.startDate <= :now AND s.endDate >= :now")
    Optional<UserSubscription> lockActiveSubscriptionByUser(@Param("userId") Long userId, @Param("now") Instant now);

    @Query("SELECT s FROM UserSubscription s JOIN FETCH s.plan WHERE s.user.userId = :userId AND s.status = 'ACTIVE' AND s.endDate >= :now ORDER BY s.endDate DESC")
    List<UserSubscription> findCurrentOrFutureByUser(@Param("userId") Long userId, @Param("now") Instant now);

    @Query("SELECT s FROM UserSubscription s JOIN FETCH s.plan WHERE s.user.userId = :userId AND s.endDate < :now ORDER BY s.endDate DESC LIMIT 1")
    Optional<UserSubscription> findLatestExpiredByUser(@Param("userId") Long userId, @Param("now") Instant now);

    // Subscriber counts for admin plan list/detail (group C): [planId, activeCount]
    // "Active" matches findActiveSubscriptionByUser: status ACTIVE inside the paid window.
    @Query("SELECT s.plan.planId, COUNT(s) FROM UserSubscription s WHERE s.plan.planId IN :ids AND s.status = 'ACTIVE' AND s.startDate <= :now AND s.endDate >= :now GROUP BY s.plan.planId")
    List<Object[]> countActiveByPlanIds(@Param("ids") Collection<Long> ids, @Param("now") Instant now);

    // [planId, totalCount]
    @Query("SELECT s.plan.planId, COUNT(s) FROM UserSubscription s WHERE s.plan.planId IN :ids GROUP BY s.plan.planId")
    List<Object[]> countTotalByPlanIds(@Param("ids") Collection<Long> ids);

    // API 26 delete guard: status-only on purpose (an expired-but-ACTIVE row still blocks, so the
    // delete is conservative and never strands a subscription row flagged ACTIVE).
    @Query("SELECT COUNT(s) FROM UserSubscription s WHERE s.plan.planId = :planId AND s.status = 'ACTIVE'")
    long countActiveByPlan(@Param("planId") Long planId);
}
