package com.examprep.dto;

import com.examprep.entities.Role;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class RoleResponse {

    private String code;
    private String name;

    public static RoleResponse from(Role role) {
        if (role == null) return null;
        return RoleResponse.builder()
                .code(role.getRoleCode())
                .name(role.getRoleName())
                .build();
    }
}
