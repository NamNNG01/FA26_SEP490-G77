package com.examprep.dto;

import com.examprep.entities.User;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;

/**
 * UM-03 / UM-04: profile returned after a successful update or status change.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AdminUserResponse {

    private Long userId;
    private String fullName;
    private String email;
    private String avatarUrl;
    /** STUDENT, COURSE_MANAGER or ADMIN. */
    private String role;
    /** ACTIVE or INACTIVE. */
    private String status;
    private Instant createdAt;

    public static AdminUserResponse from(User user) {
        return AdminUserResponse.builder()
                .userId(user.getUserId())
                .fullName(user.getFullName())
                .email(user.getEmail())
                .avatarUrl(user.getAvatarUrl())
                .role(user.getRoleName())
                .status(user.getStatus())
                .createdAt(user.getCreatedAt())
                .build();
    }
}
