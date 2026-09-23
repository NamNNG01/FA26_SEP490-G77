package com.examprep.services;

import com.examprep.exceptions.BadRequestException;
import com.examprep.exceptions.UnauthorizedException;
import com.examprep.dto.*;
import com.examprep.entities.RefreshToken;
import com.examprep.repositories.RefreshTokenRepository;
import com.examprep.entities.Role;
import com.examprep.entities.User;
import com.examprep.repositories.RoleRepository;
import com.examprep.repositories.UserRepository;
import com.examprep.security.JwtTokenProvider;
import com.examprep.security.UserPrincipal;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.time.Instant;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class AuthServiceTest {

    @Mock
    private UserRepository userRepository;

    @Mock
    private RoleRepository roleRepository;

    @Mock
    private RefreshTokenRepository refreshTokenRepository;

    @Mock
    private PasswordEncoder passwordEncoder;

    @Mock
    private JwtTokenProvider tokenProvider;

    @InjectMocks
    private AuthServiceImpl authService;

    private Role studentRole;
    private User testUser;

    @BeforeEach
    void setUp() {
        studentRole = Role.builder()
                .roleId(3L)
                .roleCode("STUDENT")
                .roleName("Học viên")
                .build();

        testUser = User.builder()
                .userId(101L)
                .email("student@gmail.com")
                .passwordHash("hashedPassword")
                .fullName("Nguyen Van A")
                .role(studentRole)
                .status("ACTIVE")
                .build();
    }

    @Test
    void register_Success() {
        RegisterRequest request = RegisterRequest.builder()
                .email("student@gmail.com")
                .password("Password@123")
                .fullName("Nguyen Van A")
                .build();

        when(userRepository.existsByEmail(anyString())).thenReturn(false);
        when(roleRepository.findByRoleCode("STUDENT")).thenReturn(Optional.of(studentRole));
        when(passwordEncoder.encode(anyString())).thenReturn("hashedPassword");
        when(userRepository.save(any(User.class))).thenReturn(testUser);

        UserResponse response = authService.register(request);

        assertNotNull(response);
        assertEquals(101L, response.getUserId());
        assertEquals("student@gmail.com", response.getEmail());
        assertEquals("STUDENT", response.getRole().getCode());
        verify(userRepository, times(1)).save(any(User.class));
    }

    @Test
    void register_DuplicateEmail_ThrowsBadRequestException() {
        RegisterRequest request = RegisterRequest.builder()
                .email("student@gmail.com")
                .password("Password@123")
                .fullName("Nguyen Van A")
                .build();

        when(userRepository.existsByEmail("student@gmail.com")).thenReturn(true);

        assertThrows(BadRequestException.class, () -> authService.register(request));
        verify(userRepository, never()).save(any(User.class));
    }

    @Test
    void login_Success() {
        LoginRequest request = LoginRequest.builder()
                .email("student@gmail.com")
                .password("Password@123")
                .build();

        when(userRepository.findByEmail("student@gmail.com")).thenReturn(Optional.of(testUser));
        when(passwordEncoder.matches("Password@123", "hashedPassword")).thenReturn(true);
        when(tokenProvider.generateAccessToken(testUser)).thenReturn("mockAccessToken");
        when(tokenProvider.generateRawRefreshToken()).thenReturn("mockRawRefreshToken");
        when(tokenProvider.hashToken("mockRawRefreshToken")).thenReturn("mockHashedRefreshToken");

        LoginResponse response = authService.login(request);

        assertNotNull(response);
        assertEquals("mockAccessToken", response.getAccessToken());
        assertEquals("mockRawRefreshToken", response.getRefreshToken());
        assertEquals("Bearer", response.getTokenType());
        assertEquals(900, response.getExpiresIn());
        assertEquals("student@gmail.com", response.getUser().getEmail());
        verify(refreshTokenRepository, times(1)).save(any(RefreshToken.class));
    }

    @Test
    void login_InvalidPassword_ThrowsUnauthorizedException() {
        LoginRequest request = LoginRequest.builder()
                .email("student@gmail.com")
                .password("WrongPassword")
                .build();

        when(userRepository.findByEmail("student@gmail.com")).thenReturn(Optional.of(testUser));
        when(passwordEncoder.matches("WrongPassword", "hashedPassword")).thenReturn(false);

        assertThrows(UnauthorizedException.class, () -> authService.login(request));
    }

    @Test
    void refreshToken_Success_Rotation() {
        RefreshTokenRequest request = RefreshTokenRequest.builder()
                .refreshToken("oldRawRefreshToken")
                .build();

        RefreshToken existingToken = RefreshToken.builder()
                .refreshTokenId(1L)
                .user(testUser)
                .tokenHash("oldHashedToken")
                .expiresAt(Instant.now().plusSeconds(3600))
                .revokedAt(null)
                .build();

        when(tokenProvider.hashToken("oldRawRefreshToken")).thenReturn("oldHashedToken");
        when(refreshTokenRepository.findByTokenHash("oldHashedToken")).thenReturn(Optional.of(existingToken));
        when(tokenProvider.generateAccessToken(testUser)).thenReturn("newAccessToken");
        when(tokenProvider.generateRawRefreshToken()).thenReturn("newRawRefreshToken");
        when(tokenProvider.hashToken("newRawRefreshToken")).thenReturn("newHashedToken");

        TokenResponse response = authService.refreshToken(request);

        assertNotNull(response);
        assertEquals("newAccessToken", response.getAccessToken());
        assertEquals("newRawRefreshToken", response.getRefreshToken());
        assertNotNull(existingToken.getRevokedAt()); // Verifies old token was revoked
        verify(refreshTokenRepository, times(2)).save(any(RefreshToken.class));
    }

    @Test
    void logoutAll_Success() {
        UserPrincipal currentUser = UserPrincipal.create(101L, "student@gmail.com", "STUDENT");

        authService.logoutAll(currentUser);

        verify(refreshTokenRepository, times(1)).revokeAllByUserId(eq(101L), any(Instant.class));
    }
}
