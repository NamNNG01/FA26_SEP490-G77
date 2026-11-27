package com.examprep.dto;

import com.examprep.entities.User;
import com.examprep.services.ManagerAiQuotaService;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;
import java.util.List;

/**
 * UM-02: full profile for the admin User Detail screen.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AdminUserDetailResponse {

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class AdminManagerAiQuota {
        private long globalDefaultLimit;
        private Long overrideLimit;
        private long effectiveLimit;
        private long usedTokens;
        private long reservedTokens;
        private long remainingTokens;
        private Instant periodStart;
        private Instant periodEnd;

        public static AdminManagerAiQuota from(ManagerAiQuotaService.Snapshot snap) {
            return AdminManagerAiQuota.builder()
                    .globalDefaultLimit(snap.globalDefaultLimit())
                    .overrideLimit(snap.overrideLimit())
                    .effectiveLimit(snap.effectiveLimit())
                    .usedTokens(snap.usedTokens())
                    .reservedTokens(snap.reservedTokens())
                    .remainingTokens(snap.remainingTokens())
                    .periodStart(snap.periodStart())
                    .periodEnd(snap.periodEnd())
                    .build();
        }
    }

    private AdminSubscription subscription;
    private AdminManagerAiQuota managerAiQuota;
    private Long userId;
    private String fullName;
    private String email;
    private String avatarUrl;
    /** STUDENT, COURSE_MANAGER or ADMIN. */
    private String role;
    /** ACTIVE or INACTIVE. */
    private String status;
    private Instant createdAt;
    /** Null when the account has never logged in. */
    private Instant lastLoginAt;
    private UserLearningStats stats;
    /** At most the 5 most recent submitted attempts, newest first. */
    private List<StudentRecentAttempt> recentAttempts;

    public static AdminUserDetailResponse from(User user, UserLearningStats stats,
                                               List<StudentRecentAttempt> recentAttempts) {
        return AdminUserDetailResponse.builder()
                .userId(user.getUserId())
                .fullName(user.getFullName())
                .email(user.getEmail())
                .avatarUrl(user.getAvatarUrl())
                .role(user.getRoleName())
                .status(user.getStatus())
                .createdAt(user.getCreatedAt())
                .lastLoginAt(user.getLastLoginAt())
                .stats(stats)
                .recentAttempts(recentAttempts)
                .build();
    }
}
