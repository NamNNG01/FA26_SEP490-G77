package com.examprep.dto;

import com.examprep.entities.User;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class UserResponse {

    private Long userId;
    private String email;
    private String fullName;
    private String avatarUrl;
    private String role;
    private String status;
    private Instant createdAt;
    /**
     * False for an account created by AUTH-09 that has never set a password, so
     * the client can hide password-only features. Only ever a flag — the hash
     * itself never leaves the server. Serialises as {@code hasPassword}.
     */
    private boolean hasPassword;

    public static UserResponse from(User user) {
        if (user == null) return null;
        return UserResponse.builder()
                .userId(user.getUserId())
                .email(user.getEmail())
                .fullName(user.getFullName())
                .avatarUrl(user.getAvatarUrl())
                .role(user.getRoleName())
                .status(user.getStatus())
                .createdAt(user.getCreatedAt())
                .hasPassword(user.getPasswordHash() != null)
                .build();
    }
}
