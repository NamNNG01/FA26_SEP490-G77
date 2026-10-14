package com.examprep.controllers;

import com.examprep.config.SecurityConfig;
import com.examprep.dto.UpdateProfileRequest;
import com.examprep.dto.UserResponse;
import com.examprep.security.JwtTokenProvider;
import com.examprep.security.RestAccessDeniedHandler;
import com.examprep.security.RestAuthenticationEntryPoint;
import com.examprep.security.UserPrincipal;
import com.examprep.services.UserService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(UserController.class)
@Import({SecurityConfig.class, RestAuthenticationEntryPoint.class, RestAccessDeniedHandler.class})
class UserControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @MockBean
    private UserService userService;

    @MockBean
    private JwtTokenProvider jwtTokenProvider;

    @Test
    void getCurrentUser_Success() throws Exception {
        UserResponse userResponse = UserResponse.builder()
                .userId(101L)
                .email("student@gmail.com")
                .fullName("Nguyen Van A")
                .role("STUDENT")
                .status("ACTIVE")
                .build();

        UserPrincipal principal = UserPrincipal.create(101L, "student@gmail.com", "STUDENT");
        when(userService.getCurrentUser(101L)).thenReturn(userResponse);

        mockMvc.perform(get("/api/v1/users/me").with(user(principal)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.userId").value(101))
                .andExpect(jsonPath("$.data.email").value("student@gmail.com"))
                .andExpect(jsonPath("$.data.role").value("STUDENT"));

        verify(userService).getCurrentUser(101L);
    }

    @Test
    void getCurrentUser_Unauthenticated_Returns401() throws Exception {
        mockMvc.perform(get("/api/v1/users/me"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.success").value(false));

        verifyNoInteractions(userService);
    }

    @Test
    void updateProfile_Success() throws Exception {
        UpdateProfileRequest request = UpdateProfileRequest.builder()
                .fullName("Nguyen Van Nam")
                .avatarUrl("https://cdn.example.com/avatar.jpg")
                .build();

        UserResponse userResponse = UserResponse.builder()
                .userId(101L)
                .email("student@gmail.com")
                .fullName("Nguyen Van Nam")
                .avatarUrl("https://cdn.example.com/avatar.jpg")
                .role("STUDENT")
                .status("ACTIVE")
                .build();

        UserPrincipal principal = UserPrincipal.create(101L, "student@gmail.com", "STUDENT");
        when(userService.updateProfile(eq(101L), any(UpdateProfileRequest.class))).thenReturn(userResponse);

        mockMvc.perform(put("/api/v1/users/me")
                        .with(csrf())
                        .with(user(principal))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.message").value("Profile updated successfully."))
                .andExpect(jsonPath("$.data.fullName").value("Nguyen Van Nam"))
                .andExpect(jsonPath("$.data.avatarUrl").value("https://cdn.example.com/avatar.jpg"));
    }

    @Test
    void updateProfile_Unauthenticated_Returns401() throws Exception {
        UpdateProfileRequest request = UpdateProfileRequest.builder()
                .fullName("Nguyen Van Nam")
                .build();

        mockMvc.perform(put("/api/v1/users/me")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.success").value(false));

        verifyNoInteractions(userService);
    }
}
