package com.examprep.repositories;

import com.examprep.entities.UserNotification;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface UserNotificationRepository extends JpaRepository<UserNotification, Long> {
    /** The graph loads the notification in one query without breaking the pagination count query. */
    @EntityGraph(attributePaths = "notification")
    @Query("select un from UserNotification un where un.user.userId = :userId and (:unreadOnly = false or un.isRead = false)")
    Page<UserNotification> findInbox(@Param("userId") Long userId, @Param("unreadOnly") boolean unreadOnly, Pageable pageable);

    long countByUserUserIdAndIsReadFalse(Long userId);
    Optional<UserNotification> findByUserUserIdAndNotificationNotificationId(Long userId, Long notificationId);

    @Modifying
    @Query("update UserNotification un set un.isRead = true where un.user.userId = :userId and un.isRead = false")
    int markAllRead(@Param("userId") Long userId);
}
