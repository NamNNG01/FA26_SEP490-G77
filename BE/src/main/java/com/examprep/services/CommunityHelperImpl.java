package com.examprep.services;

import com.examprep.entities.Notification;
import com.examprep.entities.User;
import com.examprep.entities.UserNotification;
import com.examprep.exceptions.ForbiddenException;
import com.examprep.repositories.NotificationRepository;
import com.examprep.repositories.UserNotificationRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.List;

/**
 * Shared helper for community moderation rules, account mute checks, and notifications.
 */
@Component
@RequiredArgsConstructor
public class CommunityHelperImpl implements CommunityHelper {

    private static final List<String> BLOCKED_KEYWORDS = List.of(
            "http://", "https://", "www.",
            "casino", "gambling", "betting", "scam", "sell account", "advertisement"
    );

    private static final DateTimeFormatter DATE_FORMAT =
            DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm").withZone(ZoneId.of("Asia/Ho_Chi_Minh"));

    private final NotificationRepository notificationRepository;
    private final UserNotificationRepository userNotificationRepository;

    @Override
    public void checkNotMuted(User user) {
        Instant mutedUntil = user.getCommunityMutedUntil();
        if (mutedUntil != null && mutedUntil.isAfter(Instant.now())) {
            String untilText = DATE_FORMAT.format(mutedUntil);
            String reason = user.getCommunityMuteReason() != null ? user.getCommunityMuteReason() : "Violation of community guidelines";
            throw new ForbiddenException("Your account is temporarily muted from community interactions until " + untilText + ". Reason: " + reason);
        }
    }

    @Override
    public boolean shouldAutoApprove(User user, String title, String content, String imageUrl, long rejectedCount) {
        if (imageUrl != null && !imageUrl.isBlank()) {
            return false;
        }
        if (rejectedCount > 0) {
            return false;
        }
        if (user.getCommunityMutedUntil() != null) {
            return false;
        }
        String combined = ((title != null ? title : "") + " " + (content != null ? content : "")).toLowerCase();
        for (String keyword : BLOCKED_KEYWORDS) {
            if (combined.contains(keyword)) {
                return false;
            }
        }
        return true;
    }

    @Override
    public void sendNotification(User targetUser, String title, String content, String type, Long discussionId) {
        if (targetUser == null) {
            return;
        }
        Notification notification = Notification.builder()
                .title(title)
                .content(content)
                .type(type)
                .targetType("USER")
                .referenceType("DISCUSSION")
                .referenceId(discussionId)
                .link("/student/discussions/" + discussionId)
                .build();
        Notification saved = notificationRepository.save(notification);

        UserNotification userNotification = UserNotification.builder()
                .user(targetUser)
                .notification(saved)
                .isRead(false)
                .build();
        userNotificationRepository.save(userNotification);
    }
}
