package com.examprep.repositories;

import com.examprep.entities.UserSubscription;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.Optional;

@Repository
public interface UserSubscriptionRepository extends JpaRepository<UserSubscription, Long> {

    @Query("SELECT s FROM UserSubscription s WHERE s.user.userId = :userId AND s.status = 'ACTIVE' AND s.startDate <= :now AND s.endDate >= :now")
    Optional<UserSubscription> findActiveSubscriptionByUser(@Param("userId") Long userId, @Param("now") Instant now);

    @Query("SELECT s FROM UserSubscription s JOIN FETCH s.plan WHERE s.user.userId = :userId AND s.endDate < :now ORDER BY s.endDate DESC LIMIT 1")
    Optional<UserSubscription> findLatestExpiredByUser(@Param("userId") Long userId, @Param("now") Instant now);
}
