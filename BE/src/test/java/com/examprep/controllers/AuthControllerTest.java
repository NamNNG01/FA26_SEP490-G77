package com.examprep.controllers;

import com.examprep.config.SecurityConfig;
import com.examprep.dto.*;
import com.examprep.services.AuthService;
import com.examprep.security.JwtTokenProvider;
import com.examprep.security.RestAccessDeniedHandler;
import com.examprep.security.RestAuthenticationEntryPoint;
import com.examprep.security.UserPrincipal;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(AuthController.class)
@Import({SecurityConfig.class, RestAuthenticationEntryPoint.class, RestAccessDeniedHandler.class})
class AuthControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @MockBean
    private AuthService authService;

    @MockBean
    private JwtTokenProvider jwtTokenProvider;

    @Test
    void register_Success() throws Exception {
        RegisterRequest request = RegisterRequest.builder()
                .email("student@gmail.com")
                .password("Password@123")
                .fullName("Nguyen Van A")
                .build();

        UserResponse userResponse = UserResponse.builder()
                .userId(101L)
                .email("student@gmail.com")
                .fullName("Nguyen Van A")
                .role("STUDENT")
                .status("ACTIVE")
                .build();

        when(authService.register(any(RegisterRequest.class))).thenReturn(userResponse);

        mockMvc.perform(post("/api/v1/auth/register")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.userId").value(101))
                .andExpect(jsonPath("$.data.email").value("student@gmail.com"))
                .andExpect(jsonPath("$.data.role").value("STUDENT"));
    }

    @Test
    void login_Success() throws Exception {
        LoginRequest request = LoginRequest.builder()
                .email("student@gmail.com")
                .password("Password@123")
                .build();

        LoginResponse loginResponse = LoginResponse.builder()
                .accessToken("accessToken123")
                .refreshToken("refreshToken123")
                .tokenType("Bearer")
                .expiresIn(900)
                .user(UserResponse.builder()
                        .userId(101L)
                        .email("student@gmail.com")
                        .fullName("Nguyen Van A")
                        .role("STUDENT")
                        .status("ACTIVE")
                        .build())
                .build();

        when(authService.login(any(LoginRequest.class))).thenReturn(loginResponse);

        mockMvc.perform(post("/api/v1/auth/login")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.accessToken").value("accessToken123"))
                .andExpect(jsonPath("$.data.refreshToken").value("refreshToken123"))
                .andExpect(jsonPath("$.data.expiresIn").value(900));
    }

    @Test
    void refreshToken_Success() throws Exception {
        RefreshTokenRequest request = RefreshTokenRequest.builder()
                .refreshToken("oldRefreshToken")
                .build();

        TokenResponse tokenResponse = TokenResponse.builder()
                .accessToken("newAccessToken")
                .refreshToken("newRefreshToken")
                .tokenType("Bearer")
                .expiresIn(900)
                .build();

        when(authService.refreshToken(any(RefreshTokenRequest.class))).thenReturn(tokenResponse);

        mockMvc.perform(post("/api/v1/auth/refresh")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.accessToken").value("newAccessToken"))
                .andExpect(jsonPath("$.data.refreshToken").value("newRefreshToken"));
    }

    @Test
    void logout_Success() throws Exception {
        LogoutRequest request = LogoutRequest.builder()
                .refreshToken("someRefreshToken")
                .build();

        UserPrincipal principal = UserPrincipal.create(101L, "student@gmail.com", "STUDENT");
        doNothing().when(authService).logout(any(LogoutRequest.class), any());

        mockMvc.perform(post("/api/v1/auth/logout")
                        .with(csrf())
                        .with(user(principal))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.message").value("Logout successful."));
    }

    @Test
    void logoutAll_Success() throws Exception {
        UserPrincipal principal = UserPrincipal.create(101L, "student@gmail.com", "STUDENT");
        doNothing().when(authService).logoutAll(any());

        mockMvc.perform(post("/api/v1/auth/logout-all")
                        .with(csrf())
                        .with(user(principal)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.message").value("All sessions have been logged out."));
    }

    @Test
    void forgotPassword_Success() throws Exception {
        ForgotPasswordRequest request = ForgotPasswordRequest.builder()
                .email("student@gmail.com")
                .build();

        doNothing().when(authService).forgotPassword(any(ForgotPasswordRequest.class));

        mockMvc.perform(post("/api/v1/auth/password/forgot")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.message").value("If the email exists, a password reset link has been sent."));
    }

    @Test
    void forgotPassword_InvalidEmail_Returns400() throws Exception {
        ForgotPasswordRequest request = ForgotPasswordRequest.builder()
                .email("not-an-email")
                .build();

        mockMvc.perform(post("/api/v1/auth/password/forgot")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.success").value(false));
    }

    @Test
    void resetPassword_Success() throws Exception {
        ResetPasswordRequest request = ResetPasswordRequest.builder()
                .token("rawResetToken")
                .newPassword("NewPassword@123")
                .build();

        doNothing().when(authService).resetPassword(any(ResetPasswordRequest.class));

        mockMvc.perform(post("/api/v1/auth/password/reset")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.message").value("Password reset successfully."));
    }

    @Test
    void changePassword_Success() throws Exception {
        ChangePasswordRequest request = ChangePasswordRequest.builder()
                .currentPassword("Password@123")
                .newPassword("NewPassword@123")
                .build();

        UserPrincipal principal = UserPrincipal.create(101L, "student@gmail.com", "STUDENT");
        doNothing().when(authService).changePassword(any(ChangePasswordRequest.class), any());

        mockMvc.perform(put("/api/v1/auth/password/change")
                        .with(csrf())
                        .with(user(principal))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.message").value("Password changed successfully."));
    }

    @Test
    void changePassword_Unauthenticated_Returns401() throws Exception {
        ChangePasswordRequest request = ChangePasswordRequest.builder()
                .currentPassword("Password@123")
                .newPassword("NewPassword@123")
                .build();

        mockMvc.perform(put("/api/v1/auth/password/change")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.success").value(false));
    }
}

