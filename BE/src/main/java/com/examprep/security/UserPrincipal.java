package com.examprep.security;

import com.examprep.entities.User;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;

import java.util.Collection;
import java.util.Collections;

@Getter
@Builder
@AllArgsConstructor
public class UserPrincipal implements UserDetails {

    private final Long id;
    private final String email;
    private final String role;
    private final Collection<? extends GrantedAuthority> authorities;

    public static UserPrincipal create(User user) {
        String roleCode = user.getRole().getRoleCode();
        String authorityRole = roleCode.startsWith("ROLE_") ? roleCode : "ROLE_" + roleCode;
        return UserPrincipal.builder()
                .id(user.getUserId())
                .email(user.getEmail())
                .role(roleCode)
                .authorities(Collections.singletonList(new SimpleGrantedAuthority(authorityRole)))
                .build();
    }

    public static UserPrincipal create(Long id, String email, String role) {
        String authorityRole = role.startsWith("ROLE_") ? role : "ROLE_" + role;
        return UserPrincipal.builder()
                .id(id)
                .email(email)
                .role(role)
                .authorities(Collections.singletonList(new SimpleGrantedAuthority(authorityRole)))
                .build();
    }

    @Override
    public Collection<? extends GrantedAuthority> getAuthorities() {
        return authorities;
    }

    @Override
    public String getPassword() {
        return null;
    }

    @Override
    public String getUsername() {
        return email;
    }

    @Override
    public boolean isAccountNonExpired() {
        return true;
    }

    @Override
    public boolean isAccountNonLocked() {
        return true;
    }

    @Override
    public boolean isCredentialsNonExpired() {
        return true;
    }

    @Override
    public boolean isEnabled() {
        return true;
    }
}
