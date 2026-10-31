package com.examprep.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * AUTH-09 response: identical to {@link LoginResponse} plus {@code isNewUser},
 * which lets the frontend greet a first-time Google account differently from a
 * returning one. Password login (AUTH-02) keeps returning {@link LoginResponse}.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class GoogleLoginResponse {

    private String accessToken;
    private String refreshToken;
    @Builder.Default
    private String tokenType = "Bearer";
    @Builder.Default
    private long expiresIn = 900; // 15 minutes in seconds
    private UserResponse user;
    /**
     * True when this call created the account, false when it matched an existing
     * one. Serialises as {@code newUser} (Lombok generates {@code isNewUser()}).
     */
    private boolean newUser;

    public static GoogleLoginResponse from(LoginResponse session, boolean newUser) {
        return GoogleLoginResponse.builder()
                .accessToken(session.getAccessToken())
                .refreshToken(session.getRefreshToken())
                .tokenType(session.getTokenType())
                .expiresIn(session.getExpiresIn())
                .user(session.getUser())
                .newUser(newUser)
                .build();
    }
}
