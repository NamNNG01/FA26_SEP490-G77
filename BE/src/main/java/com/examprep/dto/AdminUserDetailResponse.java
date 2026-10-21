package com.examprep.dto;

import com.examprep.entities.User;
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
