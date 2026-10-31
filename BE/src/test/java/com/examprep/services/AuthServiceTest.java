package com.examprep.services;

import com.examprep.exceptions.BadRequestException;
import com.examprep.exceptions.ResourceNotFoundException;
import com.examprep.exceptions.UnauthorizedException;
import com.examprep.dto.*;
import com.examprep.entities.PasswordResetToken;
import com.examprep.repositories.PasswordResetTokenRepository;
import com.examprep.entities.RefreshToken;
import com.examprep.repositories.RefreshTokenRepository;
import com.examprep.entities.User;
import com.examprep.repositories.UserRepository;
import com.examprep.security.GoogleTokenVerifier;
import com.examprep.security.GoogleUserInfo;
import com.examprep.security.JwtTokenProvider;
import com.examprep.security.UserPrincipal;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
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
    private RefreshTokenRepository refreshTokenRepository;

    @Mock
    private PasswordResetTokenRepository passwordResetTokenRepository;

    @Mock
    private PasswordEncoder passwordEncoder;

    @Mock
    private JwtTokenProvider tokenProvider;

    @Mock
    private PasswordResetMailService mailService;

    @Mock
    private GoogleTokenVerifier googleTokenVerifier;

    @InjectMocks
    private AuthServiceImpl authService;

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
    void register_Success() {
        RegisterRequest request = RegisterRequest.builder()
                .email("student@gmail.com")
                .password("Password@123")
                .fullName("Nguyen Van A")
                .build();

        when(userRepository.existsByEmail(anyString())).thenReturn(false);
        when(passwordEncoder.encode(anyString())).thenReturn("hashedPassword");
        when(userRepository.save(any(User.class))).thenReturn(testUser);

        UserResponse response = authService.register(request);

        assertNotNull(response);
        assertEquals(101L, response.getUserId());
        assertEquals("student@gmail.com", response.getEmail());
        assertEquals("STUDENT", response.getRole());
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
                .roleName(User.ROLE_STUDENT)
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
    void forgotPassword_ExistingEmail_IssuesToken() {
        ForgotPasswordRequest request = ForgotPasswordRequest.builder()
                .email("student@gmail.com")
                .build();

        when(userRepository.findByEmail("student@gmail.com")).thenReturn(Optional.of(testUser));
        when(tokenProvider.generateRawRefreshToken()).thenReturn("rawResetToken");
        when(tokenProvider.hashToken("rawResetToken")).thenReturn("hashedResetToken");
        when(mailService.sendPasswordResetEmail(anyString(), any(), anyString(), anyLong())).thenReturn(true);

        assertDoesNotThrow(() -> authService.forgotPassword(request));

        verify(passwordResetTokenRepository, times(1)).save(any(PasswordResetToken.class));
        verify(mailService, times(1)).sendPasswordResetEmail(eq("student@gmail.com"), any(), anyString(), anyLong());
    }

    @Test
    void forgotPassword_UnknownEmail_SucceedsSilentlyWithoutToken() {
        ForgotPasswordRequest request = ForgotPasswordRequest.builder()
                .email("ghost@gmail.com")
                .build();

        when(userRepository.findByEmail("ghost@gmail.com")).thenReturn(Optional.empty());

        assertDoesNotThrow(() -> authService.forgotPassword(request));

        verify(passwordResetTokenRepository, never()).save(any(PasswordResetToken.class));
    }

    @Test
    void resetPassword_Success_RevokesSessions() {
        ResetPasswordRequest request = ResetPasswordRequest.builder()
                .token("rawResetToken")
                .newPassword("NewPassword@123")
                .build();

        PasswordResetToken resetToken = PasswordResetToken.builder()
                .resetTokenId(1L)
                .user(testUser)
                .tokenHash("hashedResetToken")
                .expiresAt(Instant.now().plusSeconds(900))
                .usedAt(null)
                .build();

        when(tokenProvider.hashToken("rawResetToken")).thenReturn("hashedResetToken");
        when(passwordResetTokenRepository.findByTokenHash("hashedResetToken"))
                .thenReturn(Optional.of(resetToken));
        when(passwordEncoder.matches("NewPassword@123", "hashedPassword")).thenReturn(false);
        when(passwordResetTokenRepository.markAsUsed(eq(1L), any(Instant.class))).thenReturn(1);
        when(passwordEncoder.encode("NewPassword@123")).thenReturn("newHashedPassword");

        authService.resetPassword(request);

        assertEquals("newHashedPassword", testUser.getPasswordHash());
        assertNotNull(testUser.getPasswordChangedAt());
        verify(userRepository, times(1)).save(testUser);
        verify(refreshTokenRepository, times(1)).revokeAllByUserId(eq(101L), any(Instant.class));
        verify(passwordResetTokenRepository, times(1)).invalidateAllActiveByUserId(eq(101L), any(Instant.class));
    }

    @Test
    void resetPassword_SameAsCurrent_ThrowsBadRequestException() {
        ResetPasswordRequest request = ResetPasswordRequest.builder()
                .token("rawResetToken")
                .newPassword("Password@123")
                .build();

        PasswordResetToken resetToken = PasswordResetToken.builder()
                .resetTokenId(1L)
                .user(testUser)
                .tokenHash("hashedResetToken")
                .expiresAt(Instant.now().plusSeconds(900))
                .usedAt(null)
                .build();

        when(tokenProvider.hashToken("rawResetToken")).thenReturn("hashedResetToken");
        when(passwordResetTokenRepository.findByTokenHash("hashedResetToken"))
                .thenReturn(Optional.of(resetToken));
        when(passwordEncoder.matches("Password@123", "hashedPassword")).thenReturn(true);

        assertThrows(BadRequestException.class, () -> authService.resetPassword(request));
        verify(passwordResetTokenRepository, never()).markAsUsed(any(), any());
        verify(userRepository, never()).save(any(User.class));
    }

    @Test
    void resetPassword_UnknownToken_ThrowsUnauthorizedException() {
        ResetPasswordRequest request = ResetPasswordRequest.builder()
                .token("bogus")
                .newPassword("NewPassword@123")
                .build();

        when(tokenProvider.hashToken("bogus")).thenReturn("bogusHash");
        when(passwordResetTokenRepository.findByTokenHash("bogusHash")).thenReturn(Optional.empty());

        assertThrows(UnauthorizedException.class, () -> authService.resetPassword(request));
        verify(userRepository, never()).save(any(User.class));
    }

    @Test
    void resetPassword_UsedToken_ThrowsUnauthorizedException() {
        ResetPasswordRequest request = ResetPasswordRequest.builder()
                .token("rawResetToken")
                .newPassword("NewPassword@123")
                .build();

        PasswordResetToken usedToken = PasswordResetToken.builder()
                .resetTokenId(1L)
                .user(testUser)
                .tokenHash("hashedResetToken")
                .expiresAt(Instant.now().plusSeconds(900))
                .usedAt(Instant.now().minusSeconds(60))
                .build();

        when(tokenProvider.hashToken("rawResetToken")).thenReturn("hashedResetToken");
        when(passwordResetTokenRepository.findByTokenHash("hashedResetToken"))
                .thenReturn(Optional.of(usedToken));

        assertThrows(UnauthorizedException.class, () -> authService.resetPassword(request));
        verify(userRepository, never()).save(any(User.class));
    }

    @Test
    void resetPassword_ExpiredToken_ThrowsUnauthorizedException() {
        ResetPasswordRequest request = ResetPasswordRequest.builder()
                .token("rawResetToken")
                .newPassword("NewPassword@123")
                .build();

        PasswordResetToken expiredToken = PasswordResetToken.builder()
                .resetTokenId(1L)
                .user(testUser)
                .tokenHash("hashedResetToken")
                .expiresAt(Instant.now().minusSeconds(60))
                .usedAt(null)
                .build();

        when(tokenProvider.hashToken("rawResetToken")).thenReturn("hashedResetToken");
        when(passwordResetTokenRepository.findByTokenHash("hashedResetToken"))
                .thenReturn(Optional.of(expiredToken));

        assertThrows(UnauthorizedException.class, () -> authService.resetPassword(request));
        verify(userRepository, never()).save(any(User.class));
    }

    @Test
    void resetPassword_AlreadyConsumed_ThrowsUnauthorizedException() {        ResetPasswordRequest request = ResetPasswordRequest.builder()
                .token("rawResetToken")
                .newPassword("NewPassword@123")
                .build();

        PasswordResetToken activeToken = PasswordResetToken.builder()
                .resetTokenId(1L)
                .user(testUser)
                .tokenHash("hashedResetToken")
                .expiresAt(Instant.now().plusSeconds(900))
                .usedAt(null)
                .build();

        when(tokenProvider.hashToken("rawResetToken")).thenReturn("hashedResetToken");
        when(passwordResetTokenRepository.findByTokenHash("hashedResetToken"))
                .thenReturn(Optional.of(activeToken));
        when(passwordResetTokenRepository.markAsUsed(eq(1L), any(Instant.class))).thenReturn(0);

        assertThrows(UnauthorizedException.class, () -> authService.resetPassword(request));
        verify(userRepository, never()).save(any(User.class));
    }

    @Test
    void resetPassword_InactiveAccount_ThrowsWithoutConsumingToken() {
        ResetPasswordRequest request = ResetPasswordRequest.builder()
                .token("rawResetToken")
                .newPassword("NewPassword@123")
                .build();

        User inactiveUser = User.builder()
                .userId(101L)
                .email("student@gmail.com")
                .passwordHash("hashedPassword")
                .fullName("Nguyen Van A")
                .roleName(User.ROLE_STUDENT)
                .status("INACTIVE")
                .build();

        PasswordResetToken activeToken = PasswordResetToken.builder()
                .resetTokenId(1L)
                .user(inactiveUser)
                .tokenHash("hashedResetToken")
                .expiresAt(Instant.now().plusSeconds(900))
                .usedAt(null)
                .build();

        when(tokenProvider.hashToken("rawResetToken")).thenReturn("hashedResetToken");
        when(passwordResetTokenRepository.findByTokenHash("hashedResetToken"))
                .thenReturn(Optional.of(activeToken));

        assertThrows(UnauthorizedException.class, () -> authService.resetPassword(request));
        verify(passwordResetTokenRepository, never()).markAsUsed(any(), any());
        verify(userRepository, never()).save(any(User.class));
    }

    @Test
    void changePassword_Success_RevokesSessions() {
        ChangePasswordRequest request = ChangePasswordRequest.builder()
                .currentPassword("Password@123")
                .newPassword("NewPassword@123")
                .build();
        UserPrincipal currentUser = UserPrincipal.create(101L, "student@gmail.com", "STUDENT");

        when(userRepository.findById(101L)).thenReturn(Optional.of(testUser));
        when(passwordEncoder.matches("Password@123", "hashedPassword")).thenReturn(true);
        when(passwordEncoder.matches("NewPassword@123", "hashedPassword")).thenReturn(false);
        when(passwordEncoder.encode("NewPassword@123")).thenReturn("newHashedPassword");

        authService.changePassword(request, currentUser);

        assertEquals("newHashedPassword", testUser.getPasswordHash());
        assertNotNull(testUser.getPasswordChangedAt());
        verify(userRepository, times(1)).save(testUser);
        verify(refreshTokenRepository, times(1)).revokeAllByUserId(eq(101L), any(Instant.class));
        verify(passwordResetTokenRepository, times(1)).invalidateAllActiveByUserId(eq(101L), any(Instant.class));
    }

    @Test
    void changePassword_SameAsCurrent_ThrowsBadRequestException() {
        ChangePasswordRequest request = ChangePasswordRequest.builder()
                .currentPassword("Password@123")
                .newPassword("Password@123")
                .build();
        UserPrincipal currentUser = UserPrincipal.create(101L, "student@gmail.com", "STUDENT");

        when(userRepository.findById(101L)).thenReturn(Optional.of(testUser));
        when(passwordEncoder.matches("Password@123", "hashedPassword")).thenReturn(true);

        assertThrows(BadRequestException.class, () -> authService.changePassword(request, currentUser));
        verify(userRepository, never()).save(any(User.class));
        verify(refreshTokenRepository, never()).revokeAllByUserId(any(), any());
    }

    @Test
    void changePassword_WrongCurrentPassword_ThrowsUnauthorizedException() {
        ChangePasswordRequest request = ChangePasswordRequest.builder()
                .currentPassword("WrongPassword")
                .newPassword("NewPassword@123")
                .build();
        UserPrincipal currentUser = UserPrincipal.create(101L, "student@gmail.com", "STUDENT");

        when(userRepository.findById(101L)).thenReturn(Optional.of(testUser));
        when(passwordEncoder.matches("WrongPassword", "hashedPassword")).thenReturn(false);

        assertThrows(UnauthorizedException.class, () -> authService.changePassword(request, currentUser));
        verify(userRepository, never()).save(any(User.class));
    }

    @Test
    void changePassword_UserNotFound_ThrowsResourceNotFoundException() {
        ChangePasswordRequest request = ChangePasswordRequest.builder()
                .currentPassword("Password@123")
                .newPassword("NewPassword@123")
                .build();
        UserPrincipal currentUser = UserPrincipal.create(999L, "ghost@gmail.com", "STUDENT");

        when(userRepository.findById(999L)).thenReturn(Optional.empty());

        assertThrows(ResourceNotFoundException.class, () -> authService.changePassword(request, currentUser));
    }

    // ---------------------------------------------------------------- AUTH-09

    private static GoogleUserInfo googleUser(String subject, String email, boolean emailVerified) {
        return new GoogleUserInfo(
                subject, email, emailVerified, "Nguyen Van A", "https://lh3.googleusercontent.com/a/avatar");
    }

    private GoogleLoginRequest googleRequest() {
        return GoogleLoginRequest.builder().idToken("googleIdToken").build();
    }

    /** A provisioned account is a different instance from {@code testUser}, so match on type. */
    private void stubSession() {
        when(tokenProvider.generateAccessToken(any(User.class))).thenReturn("mockAccessToken");
        when(tokenProvider.generateRawRefreshToken()).thenReturn("mockRawRefreshToken");
        when(tokenProvider.hashToken("mockRawRefreshToken")).thenReturn("mockHashedRefreshToken");
    }

    @Test
    void loginWithGoogle_UnknownAccount_ProvisionsStudent() {
        when(googleTokenVerifier.verify("googleIdToken"))
                .thenReturn(googleUser("google-sub-1", "New.Student@Gmail.com", true));
        when(userRepository.findByGoogleId("google-sub-1")).thenReturn(Optional.empty());
        when(userRepository.findByEmail("new.student@gmail.com")).thenReturn(Optional.empty());
        when(userRepository.save(any(User.class))).thenAnswer(invocation -> invocation.getArgument(0));
        stubSession();

        GoogleLoginResponse response = authService.loginWithGoogle(googleRequest());

        assertTrue(response.isNewUser());
        assertEquals("new.student@gmail.com", response.getUser().getEmail());
        assertEquals("STUDENT", response.getUser().getRole());

        ArgumentCaptor<User> saved = ArgumentCaptor.forClass(User.class);
        verify(userRepository).save(saved.capture());
        User provisioned = saved.getValue();
        assertEquals("google-sub-1", provisioned.getGoogleId());
        assertEquals("ACTIVE", provisioned.getStatus());
        assertNull(provisioned.getPasswordHash(), "a Google-only account has no password to match");
        assertNotNull(provisioned.getLastLoginAt());
        verify(refreshTokenRepository, times(1)).save(any(RefreshToken.class));
    }

    @Test
    void loginWithGoogle_LinkedAccount_ReusesItAndSkipsEmailLookup() {
        testUser.setGoogleId("google-sub-1");
        when(googleTokenVerifier.verify("googleIdToken"))
                .thenReturn(googleUser("google-sub-1", "student@gmail.com", true));
        when(userRepository.findByGoogleId("google-sub-1")).thenReturn(Optional.of(testUser));
        when(userRepository.save(testUser)).thenReturn(testUser);
        stubSession();

        GoogleLoginResponse response = authService.loginWithGoogle(googleRequest());

        assertFalse(response.isNewUser());
        assertEquals(101L, response.getUser().getUserId());
        assertNotNull(testUser.getLastLoginAt());
        verify(userRepository, never()).findByEmail(anyString());
    }

    @Test
    void loginWithGoogle_ExistingPasswordAccount_LinksGoogleIdAndKeepsPassword() {
        when(googleTokenVerifier.verify("googleIdToken"))
                .thenReturn(googleUser("google-sub-9", "Student@Gmail.com", true));
        when(userRepository.findByGoogleId("google-sub-9")).thenReturn(Optional.empty());
        when(userRepository.findByEmail("student@gmail.com")).thenReturn(Optional.of(testUser));
        when(userRepository.save(testUser)).thenReturn(testUser);
        stubSession();

        GoogleLoginResponse response = authService.loginWithGoogle(googleRequest());

        assertFalse(response.isNewUser());
        assertEquals("google-sub-9", testUser.getGoogleId());
        assertEquals("hashedPassword", testUser.getPasswordHash(), "linking must not clear the password");
        assertEquals("https://lh3.googleusercontent.com/a/avatar", testUser.getAvatarUrl());
    }

    @Test
    void loginWithGoogle_UnverifiedGoogleEmail_ThrowsUnauthorizedException() {
        when(googleTokenVerifier.verify("googleIdToken"))
                .thenReturn(googleUser("google-sub-1", "student@gmail.com", false));

        assertThrows(UnauthorizedException.class, () -> authService.loginWithGoogle(googleRequest()));
        verify(userRepository, never()).save(any(User.class));
        verify(refreshTokenRepository, never()).save(any(RefreshToken.class));
    }

    @Test
    void loginWithGoogle_EmailOwnedByAnotherGoogleAccount_ThrowsUnauthorizedException() {
        testUser.setGoogleId("google-sub-original");
        when(googleTokenVerifier.verify("googleIdToken"))
                .thenReturn(googleUser("google-sub-other", "student@gmail.com", true));
        when(userRepository.findByGoogleId("google-sub-other")).thenReturn(Optional.empty());
        when(userRepository.findByEmail("student@gmail.com")).thenReturn(Optional.of(testUser));

        assertThrows(UnauthorizedException.class, () -> authService.loginWithGoogle(googleRequest()));
        verify(userRepository, never()).save(any(User.class));
    }

    @Test
    void loginWithGoogle_InactiveAccount_ThrowsUnauthorizedException() {
        testUser.setStatus("INACTIVE");
        testUser.setGoogleId("google-sub-1");
        when(googleTokenVerifier.verify("googleIdToken"))
                .thenReturn(googleUser("google-sub-1", "student@gmail.com", true));
        when(userRepository.findByGoogleId("google-sub-1")).thenReturn(Optional.of(testUser));

        assertThrows(UnauthorizedException.class, () -> authService.loginWithGoogle(googleRequest()));
        verify(userRepository, never()).save(any(User.class));
    }

    @Test
    void loginWithGoogle_GoogleEmailMissing_ThrowsUnauthorizedException() {
        when(googleTokenVerifier.verify("googleIdToken"))
                .thenReturn(new GoogleUserInfo("google-sub-1", "  ", true, null, null));

        assertThrows(UnauthorizedException.class, () -> authService.loginWithGoogle(googleRequest()));
        verify(userRepository, never()).save(any(User.class));
    }

    @Test
    void loginWithGoogle_OverlongProfileName_IsTruncatedToTheColumnWidth() {
        String longName = "A".repeat(140);
        when(googleTokenVerifier.verify("googleIdToken"))
                .thenReturn(new GoogleUserInfo("google-sub-1", "student@gmail.com", true, longName, null));
        when(userRepository.findByGoogleId("google-sub-1")).thenReturn(Optional.empty());
        when(userRepository.findByEmail("student@gmail.com")).thenReturn(Optional.empty());
        when(userRepository.save(any(User.class))).thenAnswer(invocation -> invocation.getArgument(0));
        stubSession();

        authService.loginWithGoogle(googleRequest());

        ArgumentCaptor<User> saved = ArgumentCaptor.forClass(User.class);
        verify(userRepository).save(saved.capture());
        assertEquals(AuthServiceImpl.USER_FULL_NAME_MAX_LENGTH, saved.getValue().getFullName().length());
    }

    @Test
    void loginWithGoogle_MissingDisplayName_FallsBackToTheEmailLocalPart() {
        when(googleTokenVerifier.verify("googleIdToken"))
                .thenReturn(new GoogleUserInfo("google-sub-1", "student@gmail.com", true, null, null));
        when(userRepository.findByGoogleId("google-sub-1")).thenReturn(Optional.empty());
        when(userRepository.findByEmail("student@gmail.com")).thenReturn(Optional.empty());
        when(userRepository.save(any(User.class))).thenAnswer(invocation -> invocation.getArgument(0));
        stubSession();

        authService.loginWithGoogle(googleRequest());

        ArgumentCaptor<User> saved = ArgumentCaptor.forClass(User.class);
        verify(userRepository).save(saved.capture());
        assertEquals("student", saved.getValue().getFullName());
    }

    @Test
    void loginWithGoogle_OverlongAvatarUrl_IsDroppedInsteadOfTruncated() {
        String longAvatar = "https://lh3.googleusercontent.com/a/" + "x".repeat(600);
        when(googleTokenVerifier.verify("googleIdToken"))
                .thenReturn(new GoogleUserInfo("google-sub-1", "student@gmail.com", true, "Nguyen Van A", longAvatar));
        when(userRepository.findByGoogleId("google-sub-1")).thenReturn(Optional.empty());
        when(userRepository.findByEmail("student@gmail.com")).thenReturn(Optional.empty());
        when(userRepository.save(any(User.class))).thenAnswer(invocation -> invocation.getArgument(0));
        stubSession();

        authService.loginWithGoogle(googleRequest());

        ArgumentCaptor<User> saved = ArgumentCaptor.forClass(User.class);
        verify(userRepository).save(saved.capture());
        assertNull(saved.getValue().getAvatarUrl());
    }
}
