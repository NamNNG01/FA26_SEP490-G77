package com.examprep.repositories;

import com.examprep.config.JpaAuditingConfig;
import com.examprep.entities.Notification;
import com.examprep.entities.User;
import com.examprep.entities.UserNotification;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.autoconfigure.orm.jpa.TestEntityManager;
import org.springframework.context.annotation.Import;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.test.context.ActiveProfiles;

import java.time.Instant;

import static org.junit.jupiter.api.Assertions.assertEquals;

/** NT-01: the inbox must page and count correctly while loading the notification eagerly. */
@DataJpaTest
@ActiveProfiles("test")
@Import(JpaAuditingConfig.class)
class UserNotificationRepositoryTest {

    @Autowired
    private UserNotificationRepository notifications;

    @Autowired
    private TestEntityManager em;

    @Test
    void inboxPagesAndLoadsNotification() {
        User user = em.persist(User.builder().email("inbox@example.com").passwordHash("x").fullName("Inbox")
                .build());
        Instant base = Instant.parse("2026-01-01T00:00:00Z");
        Notification[] created = new Notification[3];
        for (int i = 0; i < 3; i++) {
            Notification notification = em.persist(Notification.builder().title("title-" + i).content("content")
                    .type("SYSTEM").build());
            created[i] = notification;
            em.persist(UserNotification.builder().user(user).notification(notification).isRead(i == 0).build());
        }
        em.flush();
        // Auditing sets created_at on insert, so pin distinct timestamps before paging.
        for (int i = 0; i < 3; i++) {
            em.getEntityManager().createQuery(
                            "update Notification n set n.createdAt = :createdAt where n.notificationId = :id")
                    .setParameter("createdAt", base.minusSeconds(i))
                    .setParameter("id", created[i].getNotificationId())
                    .executeUpdate();
        }
        em.clear();

        Page<UserNotification> page = notifications.findInbox(user.getUserId(), false,
                PageRequest.of(0, 2, Sort.by(Sort.Direction.DESC, "notification.createdAt")));

        assertEquals(3, page.getTotalElements());
        assertEquals(2, page.getContent().size());
        assertEquals("title-0", page.getContent().get(0).getNotification().getTitle());
    }
}
