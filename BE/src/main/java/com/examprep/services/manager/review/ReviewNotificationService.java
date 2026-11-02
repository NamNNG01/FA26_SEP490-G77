package com.examprep.services.manager.review;

import com.examprep.entities.Notification;
import com.examprep.entities.User;
import com.examprep.entities.UserNotification;
import com.examprep.repositories.NotificationRepository;
import com.examprep.repositories.UserRepository;
import com.examprep.repositories.UserNotificationRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

import java.time.Instant;

@Slf4j
@Service
@RequiredArgsConstructor
public class ReviewNotificationService {

    private final NotificationRepository notificationRepository;
    private final UserNotificationRepository userNotificationRepository;
    private final UserRepository userRepository;

    @Transactional(propagation = Propagation.MANDATORY)
    public void sendNotification(Long studentId, String title, String content, String type, String referenceType, String referenceId, String link) {
        User student = userRepository.findById(studentId).orElse(null);
        if (student == null) return;

        Notification notification = Notification.builder()
                .title(title)
                .content(content)
                .type(type)
                .targetType("USER")
                .referenceType(referenceType)
                .referenceId(Long.valueOf(referenceId))
                .link(link)
                .build();
        Notification savedNotif = notificationRepository.save(notification);

        UserNotification userNotif = UserNotification.builder()
                .user(student)
                .notification(savedNotif)
                .isRead(false)
                .build();
        userNotificationRepository.save(userNotif);
    }
}
