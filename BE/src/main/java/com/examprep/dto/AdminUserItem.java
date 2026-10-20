package com.examprep.dto;

import com.examprep.entities.User;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;

/**
 * UM-01: one row of the admin user list (User List screen).
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AdminUserItem {

    private Long userId;
    private String fullName;
    private String email;
    private String avatarUrl;
    /** STUDENT, COURSE_MANAGER or ADMIN. */
    private String role;
    /** ACTIVE or INACTIVE. */
    private String status;
    /** Null when the account has never logged in. */
    private Instant lastLoginAt;
    private long enrolledCoursesCount;
    private Instant createdAt;

    public static AdminUserItem from(User user, long enrolledCoursesCount) {
        return AdminUserItem.builder()
                .userId(user.getUserId())
                .fullName(user.getFullName())
                .email(user.getEmail())
                .avatarUrl(user.getAvatarUrl())
                .role(user.getRoleName())
                .status(user.getStatus())
                .lastLoginAt(user.getLastLoginAt())
                .enrolledCoursesCount(enrolledCoursesCount)
                .createdAt(user.getCreatedAt())
                .build();
    }
}
