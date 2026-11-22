package com.examprep.services;

import com.examprep.entities.User;

public interface CommunityHelper {
    void checkNotMuted(User user);
    boolean shouldAutoApprove(User user, String title, String content, String imageUrl, long rejectedCount);
    void sendNotification(User targetUser, String title, String content, String type, Long discussionId);
}
