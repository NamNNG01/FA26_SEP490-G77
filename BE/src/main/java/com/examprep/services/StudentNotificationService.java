package com.examprep.services;

import com.examprep.dto.StudentNotificationResponse;

public interface StudentNotificationService {
    StudentNotificationResponse.Inbox list(Long userId, boolean unreadOnly, int page, int size);
    StudentNotificationResponse.Read markRead(Long userId, Long notificationId);
    StudentNotificationResponse.ReadAll markAllRead(Long userId);
}
