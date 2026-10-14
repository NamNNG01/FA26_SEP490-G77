package com.examprep.services;

import com.examprep.dto.UpdateProfileRequest;
import com.examprep.dto.UserResponse;
import com.examprep.entities.User;
import com.examprep.exceptions.BadRequestException;
import com.examprep.exceptions.ResourceNotFoundException;
import com.examprep.repositories.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class UserServiceTest {

    @Mock
    private UserRepository userRepository;

    @InjectMocks
    private UserServiceImpl userService;

    private User testUser;

    @BeforeEach
    void setUp() {
        testUser = User.builder()
                .userId(101L)
                .email("student@gmail.com")
                .passwordHash("hashedPassword")
                .fullName("Nguyen Van A")
                .roleName(User.ROLE_STUDENT)
                .status("ACTIVE")
                .build();
    }

    @Test
    void getCurrentUser_Success() {
        when(userRepository.findById(101L)).thenReturn(Optional.of(testUser));

        UserResponse response = userService.getCurrentUser(101L);

        assertNotNull(response);
        assertEquals(101L, response.getUserId());
        assertEquals("student@gmail.com", response.getEmail());
        assertEquals("STUDENT", response.getRole());
    }

    @Test
    void getCurrentUser_NotFound_ThrowsResourceNotFoundException() {
        when(userRepository.findById(999L)).thenReturn(Optional.empty());

        assertThrows(ResourceNotFoundException.class, () -> userService.getCurrentUser(999L));
    }

    @Test
    void updateProfile_FullNameAndAvatar_Success() {
        UpdateProfileRequest request = UpdateProfileRequest.builder()
                .fullName("Nguyen Van Nam")
                .avatarUrl("https://cdn.example.com/avatar.jpg")
                .build();

        when(userRepository.findById(101L)).thenReturn(Optional.of(testUser));
        when(userRepository.save(any(User.class))).thenReturn(testUser);

        UserResponse response = userService.updateProfile(101L, request);

        assertEquals("Nguyen Van Nam", response.getFullName());
        assertEquals("https://cdn.example.com/avatar.jpg", response.getAvatarUrl());
        assertEquals("student@gmail.com", response.getEmail());
        verify(userRepository, times(1)).save(testUser);
    }

    @Test
    void updateProfile_OnlyFullName_LeavesAvatarUntouched() {
        testUser.setAvatarUrl("https://cdn.example.com/old.jpg");
        UpdateProfileRequest request = UpdateProfileRequest.builder()
                .fullName("Nguyen Van Nam")
                .build();

        when(userRepository.findById(101L)).thenReturn(Optional.of(testUser));
        when(userRepository.save(any(User.class))).thenReturn(testUser);

        UserResponse response = userService.updateProfile(101L, request);

        assertEquals("Nguyen Van Nam", response.getFullName());
        assertEquals("https://cdn.example.com/old.jpg", response.getAvatarUrl());
    }

    @Test
    void updateProfile_BlankAvatar_ClearsAvatar() {
        testUser.setAvatarUrl("https://cdn.example.com/old.jpg");
        UpdateProfileRequest request = UpdateProfileRequest.builder()
                .avatarUrl("   ")
                .build();

        when(userRepository.findById(101L)).thenReturn(Optional.of(testUser));
        when(userRepository.save(any(User.class))).thenReturn(testUser);

        UserResponse response = userService.updateProfile(101L, request);

        assertNull(response.getAvatarUrl());
        assertEquals("Nguyen Van A", response.getFullName());
    }

    @Test
    void updateProfile_EmptyRequest_ThrowsBadRequestException() {
        UpdateProfileRequest request = UpdateProfileRequest.builder().build();

        assertThrows(BadRequestException.class, () -> userService.updateProfile(101L, request));
        verify(userRepository, never()).findById(any());
        verify(userRepository, never()).save(any(User.class));
    }

    @Test
    void updateProfile_BlankFullName_ThrowsBadRequestException() {
        UpdateProfileRequest request = UpdateProfileRequest.builder()
                .fullName("   ")
                .build();

        when(userRepository.findById(101L)).thenReturn(Optional.of(testUser));

        assertThrows(BadRequestException.class, () -> userService.updateProfile(101L, request));
        verify(userRepository, never()).save(any(User.class));
    }

    @Test
    void updateProfile_UserNotFound_ThrowsResourceNotFoundException() {
        UpdateProfileRequest request = UpdateProfileRequest.builder()
                .fullName("Nguyen Van Nam")
                .build();

        when(userRepository.findById(999L)).thenReturn(Optional.empty());

        assertThrows(ResourceNotFoundException.class, () -> userService.updateProfile(999L, request));
    }
}
