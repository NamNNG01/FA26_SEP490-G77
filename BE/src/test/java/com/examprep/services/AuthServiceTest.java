package com.examprep.services;

import com.examprep.exceptions.BadRequestException;
import com.examprep.exceptions.UnauthorizedException;
import com.examprep.dto.*;
import com.examprep.entities.RefreshToken;
import com.examprep.entities.PasswordResetToken;
import com.examprep.repositories.PasswordResetTokenRepository;
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
import org.mockito.ArgumentCaptor;

@ExtendWith(MockitoExtension.class)
class AuthServiceTest {

    @Mock
    private UserRepository userRepository;

    @Mock
    private RoleRepository roleRepository;

    @Mock
    private RefreshTokenRepository refreshTokenRepository;

    @Mock
    private PasswordResetTokenRepository passwordResetTokenRepository;

    @Mock
    private PasswordResetEmailService passwordResetEmailService;

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
        when(refreshTokenRepository.revokeIfActive(eq(1L), any(Instant.class))).thenReturn(1);
        when(tokenProvider.generateAccessToken(testUser)).thenReturn("newAccessToken");
        when(tokenProvider.generateRawRefreshToken()).thenReturn("newRawRefreshToken");
        when(tokenProvider.hashToken("newRawRefreshToken")).thenReturn("newHashedToken");

        TokenResponse response = authService.refreshToken(request);

        assertNotNull(response);
        assertEquals("newAccessToken", response.getAccessToken());
        assertEquals("newRawRefreshToken", response.getRefreshToken());
        verify(refreshTokenRepository).revokeIfActive(eq(1L), any(Instant.class));
        verify(refreshTokenRepository, times(1)).save(any(RefreshToken.class));
    }

    @Test
    void refreshToken_Revoked_ThrowsUnauthorizedException() {
        RefreshTokenRequest request = RefreshTokenRequest.builder()
                .refreshToken("rawRefreshToken")
                .build();

        RefreshToken revokedToken = RefreshToken.builder()
                .refreshTokenId(1L)
                .user(testUser)
                .tokenHash("hashedToken")
                .expiresAt(Instant.now().plusSeconds(3600))
                .revokedAt(Instant.now())
                .build();

        when(tokenProvider.hashToken("rawRefreshToken")).thenReturn("hashedToken");
        when(refreshTokenRepository.findByTokenHash("hashedToken")).thenReturn(Optional.of(revokedToken));

        assertThrows(UnauthorizedException.class, () -> authService.refreshToken(request));
        verify(refreshTokenRepository, never()).revokeIfActive(any(), any());
    }

    @Test
    void refreshToken_AlreadyUsed_ThrowsUnauthorizedException() {
        RefreshTokenRequest request = RefreshTokenRequest.builder()
                .refreshToken("rawRefreshToken")
                .build();

        RefreshToken activeToken = RefreshToken.builder()
                .refreshTokenId(1L)
                .user(testUser)
                .tokenHash("hashedToken")
                .expiresAt(Instant.now().plusSeconds(3600))
                .revokedAt(null)
                .build();

        when(tokenProvider.hashToken("rawRefreshToken")).thenReturn("hashedToken");
        when(refreshTokenRepository.findByTokenHash("hashedToken")).thenReturn(Optional.of(activeToken));
        when(refreshTokenRepository.revokeIfActive(eq(1L), any(Instant.class))).thenReturn(0);

        assertThrows(UnauthorizedException.class, () -> authService.refreshToken(request));
        verify(refreshTokenRepository, never()).save(any(RefreshToken.class));
    }

    @Test
    void login_InactiveAccount_ThrowsUnauthorizedException() {
        LoginRequest request = LoginRequest.builder()
                .email("student@gmail.com")
                .password("Password@123")
                .build();

        User inactiveUser = User.builder()
                .userId(101L)
                .email("student@gmail.com")
                .passwordHash("hashedPassword")
                .fullName("Nguyen Van A")
                .role(studentRole)
                .status("INACTIVE")
                .build();

        when(userRepository.findByEmail("student@gmail.com")).thenReturn(Optional.of(inactiveUser));
        when(passwordEncoder.matches("Password@123", "hashedPassword")).thenReturn(true);

        assertThrows(UnauthorizedException.class, () -> authService.login(request));
        verify(refreshTokenRepository, never()).save(any(RefreshToken.class));
    }

    @Test
    void logout_Success() {
        LogoutRequest request = LogoutRequest.builder()
                .refreshToken("rawRefreshToken")
                .build();
        UserPrincipal currentUser = UserPrincipal.create(101L, "student@gmail.com", "STUDENT");

        RefreshToken activeToken = RefreshToken.builder()
                .refreshTokenId(1L)
                .user(testUser)
                .tokenHash("hashedToken")
                .expiresAt(Instant.now().plusSeconds(3600))
                .revokedAt(null)
                .build();

        when(tokenProvider.hashToken("rawRefreshToken")).thenReturn("hashedToken");
        when(refreshTokenRepository.findByTokenHash("hashedToken")).thenReturn(Optional.of(activeToken));

        authService.logout(request, currentUser);

        assertNotNull(activeToken.getRevokedAt());
        verify(refreshTokenRepository, times(1)).save(activeToken);
    }

    @Test
    void logoutAll_Success() {
        UserPrincipal currentUser = UserPrincipal.create(101L, "student@gmail.com", "STUDENT");

        authService.logoutAll(currentUser);

        verify(refreshTokenRepository, times(1)).revokeAllByUserId(eq(101L), any(Instant.class));
    }

    @Test
    void forgotPassword_StoresOnlyHashedTokenAndEmailsRawToken() {
        ForgotPasswordRequest request = ForgotPasswordRequest.builder()
                .email("student@gmail.com")
                .build();
        when(userRepository.findByEmail("student@gmail.com")).thenReturn(Optional.of(testUser));
        when(tokenProvider.generateRawRefreshToken()).thenReturn("raw-reset-token");
        when(tokenProvider.hashToken("raw-reset-token")).thenReturn("hashed-reset-token");

        authService.forgotPassword(request);

        ArgumentCaptor<PasswordResetToken> resetToken = ArgumentCaptor.forClass(PasswordResetToken.class);
        verify(passwordResetTokenRepository).save(resetToken.capture());
        assertEquals("hashed-reset-token", resetToken.getValue().getTokenHash());
        assertEquals(testUser, resetToken.getValue().getUser());
        verify(passwordResetEmailService).send(101L, "student@gmail.com", "raw-reset-token");
    }

    @Test
    void resetPassword_UsesTokenOnceAndRevokesAllSessions() {
        ResetPasswordRequest request = ResetPasswordRequest.builder()
                .token("raw-reset-token")
                .password("NewPassword@123")
                .build();
        PasswordResetToken token = PasswordResetToken.builder()
                .resetTokenId(10L)
                .user(testUser)
                .tokenHash("hashed-reset-token")
                .expiresAt(Instant.now().plusSeconds(60))
                .build();
        when(tokenProvider.hashToken("raw-reset-token")).thenReturn("hashed-reset-token");
        when(passwordResetTokenRepository.findByTokenHash("hashed-reset-token")).thenReturn(Optional.of(token));
        when(passwordResetTokenRepository.markUsedIfUnused(eq(10L), any(Instant.class))).thenReturn(1);
        when(passwordEncoder.encode("NewPassword@123")).thenReturn("new-hash");

        authService.resetPassword(request);

        assertEquals("new-hash", testUser.getPasswordHash());
        verify(refreshTokenRepository).revokeAllByUserId(eq(101L), any(Instant.class));
    }

    @Test
    void resetPassword_RejectsExpiredTokenWithoutRevokingSessions() {
        ResetPasswordRequest request = ResetPasswordRequest.builder()
                .token("raw-reset-token")
                .password("NewPassword@123")
                .build();
        PasswordResetToken token = PasswordResetToken.builder()
                .resetTokenId(10L)
                .user(testUser)
                .tokenHash("hashed-reset-token")
                .expiresAt(Instant.now().minusSeconds(1))
                .build();
        when(tokenProvider.hashToken("raw-reset-token")).thenReturn("hashed-reset-token");
        when(passwordResetTokenRepository.findByTokenHash("hashed-reset-token")).thenReturn(Optional.of(token));

        assertThrows(BadRequestException.class, () -> authService.resetPassword(request));

        verifyNoInteractions(refreshTokenRepository);
    }

    @Test
    void resetPassword_RejectsTokenAlreadyClaimedByAnotherRequest() {
        ResetPasswordRequest request = ResetPasswordRequest.builder()
                .token("raw-reset-token")
                .password("NewPassword@123")
                .build();
        PasswordResetToken token = PasswordResetToken.builder()
                .resetTokenId(10L)
                .user(testUser)
                .tokenHash("hashed-reset-token")
                .expiresAt(Instant.now().plusSeconds(60))
                .build();
        when(tokenProvider.hashToken("raw-reset-token")).thenReturn("hashed-reset-token");
        when(passwordResetTokenRepository.findByTokenHash("hashed-reset-token")).thenReturn(Optional.of(token));
        when(passwordResetTokenRepository.markUsedIfUnused(eq(10L), any(Instant.class))).thenReturn(0);

        assertThrows(BadRequestException.class, () -> authService.resetPassword(request));

        verifyNoInteractions(refreshTokenRepository);
    }

    @Test
    void changePassword_RequiresCurrentPasswordAndRevokesAllSessions() {
        ChangePasswordRequest request = ChangePasswordRequest.builder()
                .currentPassword("Password@123")
                .newPassword("NewPassword@123")
                .build();
        UserPrincipal currentUser = UserPrincipal.create(101L, "student@gmail.com", "STUDENT");
        when(userRepository.findById(101L)).thenReturn(Optional.of(testUser));
        when(passwordEncoder.matches("Password@123", "hashedPassword")).thenReturn(true);
        when(passwordEncoder.encode("NewPassword@123")).thenReturn("new-hash");

        authService.changePassword(request, currentUser);

        assertEquals("new-hash", testUser.getPasswordHash());
        verify(refreshTokenRepository).revokeAllByUserId(eq(101L), any(Instant.class));
    }

    @Test
    void changePassword_RejectsIncorrectCurrentPasswordWithoutRevokingSessions() {
        ChangePasswordRequest request = ChangePasswordRequest.builder()
                .currentPassword("WrongPassword")
                .newPassword("NewPassword@123")
                .build();
        UserPrincipal currentUser = UserPrincipal.create(101L, "student@gmail.com", "STUDENT");
        when(userRepository.findById(101L)).thenReturn(Optional.of(testUser));
        when(passwordEncoder.matches("WrongPassword", "hashedPassword")).thenReturn(false);

        assertThrows(BadRequestException.class, () -> authService.changePassword(request, currentUser));

        verifyNoInteractions(refreshTokenRepository);
    }
}
