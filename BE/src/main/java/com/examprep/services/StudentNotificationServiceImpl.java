package com.examprep.services;

import com.examprep.dto.PageResponse;
import com.examprep.dto.StudentNotificationResponse;
import com.examprep.entities.UserNotification;
import com.examprep.exceptions.BadRequestException;
import com.examprep.exceptions.ResourceNotFoundException;
import com.examprep.repositories.UserNotificationRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
public class StudentNotificationServiceImpl implements StudentNotificationService {
    private static final int MAX_PAGE_SIZE = 100;
    private final UserNotificationRepository notifications;

    @Override
    @Transactional(readOnly = true)
    public StudentNotificationResponse.Inbox list(Long userId, boolean unreadOnly, int page, int size) {
        validatePage(page, size);
        Page<UserNotification> result = notifications.findInbox(userId, unreadOnly,
                PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "notification.createdAt")));
        List<StudentNotificationResponse.Item> items = result.getContent().stream().map(row ->
                new StudentNotificationResponse.Item(row.getNotification().getNotificationId(),
                        row.getNotification().getTitle(), row.getNotification().getContent(),
                        row.getNotification().getType(), row.getNotification().getLink(),
                        Boolean.TRUE.equals(row.getIsRead()), row.getNotification().getCreatedAt())).toList();
        return new StudentNotificationResponse.Inbox(notifications.countByUserUserIdAndIsReadFalse(userId),
                items, result.getNumber(), result.getSize(), result.getTotalElements(), result.getTotalPages(),
                result.isFirst(), result.isLast());
    }

    @Override
    @Transactional
    public StudentNotificationResponse.Read markRead(Long userId, Long notificationId) {
        UserNotification row = notifications.findByUserUserIdAndNotificationNotificationId(userId, notificationId)
                .orElseThrow(() -> new ResourceNotFoundException("Notification not found"));
        row.setIsRead(true);
        notifications.save(row);
        return new StudentNotificationResponse.Read(notificationId, true,
                notifications.countByUserUserIdAndIsReadFalse(userId));
    }

    @Override
    @Transactional
    public StudentNotificationResponse.ReadAll markAllRead(Long userId) {
        int marked = notifications.markAllRead(userId);
        return new StudentNotificationResponse.ReadAll(marked, notifications.countByUserUserIdAndIsReadFalse(userId));
    }

    private void validatePage(int page, int size) {
        if (page < 0 || size < 1 || size > MAX_PAGE_SIZE) {
            throw new BadRequestException("page must be >= 0 and size must be between 1 and 100");
        }
    }
}
