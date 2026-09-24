package com.examprep.dto;

import com.examprep.entities.User;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class UserResponse {

    private Long userId;
    private String email;
    private String fullName;
    private String avatarUrl;
    private RoleResponse role;
    private String status;

    public static UserResponse from(User user) {
        if (user == null) return null;
        return UserResponse.builder()
                .userId(user.getUserId())
                .email(user.getEmail())
                .fullName(user.getFullName())
                .avatarUrl(user.getAvatarUrl())
                .role(RoleResponse.from(user.getRole()))
                .status(user.getStatus())
                .build();
    }
}
