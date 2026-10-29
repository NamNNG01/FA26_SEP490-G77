package com.examprep.dto;

import java.time.Instant;
import java.util.List;

public final class StudentNotificationResponse {
    private StudentNotificationResponse() {}

    public record Item(Long notificationId, String title, String body, String type, String link,
                       boolean isRead, Instant createdAt) {}
    public record Inbox(long unreadCount, List<Item> content, int page, int size,
                        long totalElements, int totalPages, boolean first, boolean last) {}
    public record Read(Long notificationId, boolean isRead, long unreadCount) {}
    public record ReadAll(int markedCount, long unreadCount) {}
}
