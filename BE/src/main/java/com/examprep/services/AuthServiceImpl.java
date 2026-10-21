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
import com.examprep.security.JwtTokenProvider;
import com.examprep.security.UserPrincipal;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Locale;

@Slf4j
@Service
@RequiredArgsConstructor
public class AuthServiceImpl implements AuthService {

    private final UserRepository userRepository;
    private final RefreshTokenRepository refreshTokenRepository;
    private final PasswordResetTokenRepository passwordResetTokenRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtTokenProvider tokenProvider;
    private final PasswordResetMailService mailService;

    @Value("${app.frontend.base-url:http://localhost:3000}")
    private String frontendBaseUrl;

    @Value("${app.frontend.password-reset-path:/reset-password}")
    private String passwordResetPath;

    public static final long RESET_TOKEN_EXPIRATION_MS = 15 * 60 * 1000L;
    public static final long RESET_TOKEN_EXPIRATION_MINUTES = RESET_TOKEN_EXPIRATION_MS / 60000L;

    @Override
    @Transactional
    public UserResponse register(RegisterRequest request) {
        String email = normalizeEmail(request.getEmail());
        log.info("Registering new user account");

        if (userRepository.existsByEmail(email)) {
            throw new BadRequestException("Email is already registered.");
        }

        // Always assign STUDENT role for registration (role stored directly on users.role_name)
        User user = User.builder()
                .email(email)
                .passwordHash(passwordEncoder.encode(request.getPassword()))
                .fullName(request.getFullName().trim())
                .roleName(User.ROLE_STUDENT)
                .status(User.STATUS_ACTIVE)
                .build();

        User savedUser = userRepository.save(user);
        log.info("User registered successfully with ID: {}", savedUser.getUserId());
        return UserResponse.from(savedUser);
    }

    @Override
    @Transactional
    public LoginResponse login(LoginRequest request) {
        String email = normalizeEmail(request.getEmail());
        log.info("Login email received: [{}]", email);
        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> {
                    log.warn("Login failed: email not found");
                    return new UnauthorizedException(
                            "Invalid email or password.");
                });

        log.info("Login user found: id={}, email={}, status={}",
                user.getUserId(), user.getEmail(), user.getStatus());

        boolean passwordMatches =
                passwordEncoder.matches(
                        request.getPassword(),
                        user.getPasswordHash());

        log.info("Login password matches: {}", passwordMatches);

        if (!passwordMatches) {
            throw new UnauthorizedException(
                    "Invalid email or password.");
        }

        if (!User.STATUS_ACTIVE.equalsIgnoreCase(user.getStatus())) {
            throw new UnauthorizedException(
                    "User account is inactive or blocked.");
        }

        // UM-01..05: surface "Last Login" in the admin user screens.
        user.setLastLoginAt(Instant.now());

        String accessToken = tokenProvider.generateAccessToken(user);
        String rawRefreshToken = tokenProvider.generateRawRefreshToken();
        refreshTokenRepository.save(newRefreshToken(user, rawRefreshToken));

        log.info("User ID {} logged in successfully.", user.getUserId());

        return LoginResponse.builder()
                .accessToken(accessToken)
                .refreshToken(rawRefreshToken)
                .tokenType("Bearer")
                .expiresIn(JwtTokenProvider.ACCESS_TOKEN_EXPIRATION_MS / 1000)
                .user(UserResponse.from(user))
                .build();
    }

    @Override
    @Transactional
    public TokenResponse refreshToken(RefreshTokenRequest request) {
        log.info("Processing Refresh Token Rotation");

        RefreshToken refreshTokenEntity = refreshTokenRepository
                .findByTokenHash(tokenProvider.hashToken(request.getRefreshToken()))
                .orElseThrow(() -> new UnauthorizedException("Invalid refresh token."));

        if (refreshTokenEntity.getRevokedAt() != null) {
            log.warn("Attempted use of revoked refresh token for user ID: {}", refreshTokenEntity.getUser().getUserId());
            throw new UnauthorizedException("Refresh token has been revoked.");
        }

        if (refreshTokenEntity.getExpiresAt().isBefore(Instant.now())) {
            log.warn("Expired refresh token for user ID: {}", refreshTokenEntity.getUser().getUserId());
            throw new UnauthorizedException("Refresh token has expired.");
        }

        User user = refreshTokenEntity.getUser();
        if (!User.STATUS_ACTIVE.equalsIgnoreCase(user.getStatus())) {
            throw new UnauthorizedException("User account is no longer active.");
        }

        int revoked = refreshTokenRepository.revokeIfActive(refreshTokenEntity.getRefreshTokenId(), Instant.now());
        if (revoked == 0) {
            throw new UnauthorizedException("Refresh token has already been used.");
        }

        String newAccessToken = tokenProvider.generateAccessToken(user);
        String newRawRefreshToken = tokenProvider.generateRawRefreshToken();
        refreshTokenRepository.save(newRefreshToken(user, newRawRefreshToken));

        log.info("Refresh Token Rotation completed for user ID: {}", user.getUserId());

        return TokenResponse.builder()
                .accessToken(newAccessToken)
                .refreshToken(newRawRefreshToken)
                .tokenType("Bearer")
                .expiresIn(JwtTokenProvider.ACCESS_TOKEN_EXPIRATION_MS / 1000)
                .build();
    }

    @Override
    @Transactional
    public void logout(LogoutRequest request, UserPrincipal currentUser) {
        log.info("Logging out single session for user ID: {}", currentUser.getId());

        String hashedInputToken = tokenProvider.hashToken(request.getRefreshToken());

        refreshTokenRepository.findByTokenHash(hashedInputToken)
                .ifPresent(token -> {
                    if (token.getUser().getUserId().equals(currentUser.getId()) && token.getRevokedAt() == null) {
                        token.setRevokedAt(Instant.now());
                        refreshTokenRepository.save(token);
                    }
                });
    }

    @Override
    @Transactional
    public void logoutAll(UserPrincipal currentUser) {
        log.info("Logging out ALL active sessions for user ID: {}", currentUser.getId());
        refreshTokenRepository.revokeAllByUserId(currentUser.getId(), Instant.now());
    }

    @Override
    @Transactional
    public void forgotPassword(ForgotPasswordRequest request) {
        String email = normalizeEmail(request.getEmail());
        log.info("Password reset requested");

        // Uniform response: never reveal whether the email exists.
        userRepository.findByEmail(email).ifPresent(this::sendPasswordResetEmail);
    }

    @Override
    @Transactional
    public void sendPasswordResetEmail(User user) {
        String rawToken = tokenProvider.generateRawRefreshToken();
        passwordResetTokenRepository.save(PasswordResetToken.builder()
                .user(user)
                .tokenHash(tokenProvider.hashToken(rawToken))
                .expiresAt(Instant.now().plusMillis(RESET_TOKEN_EXPIRATION_MS))
                .build());
        String resetLink = buildResetLink(rawToken);
        boolean delivered = mailService.sendPasswordResetEmail(
                user.getEmail(), user.getFullName(), resetLink, RESET_TOKEN_EXPIRATION_MINUTES);
        if (delivered) {
            log.info("Password reset email sent");
        } else {
            log.warn("Password reset token issued but email delivery is disabled or failed. "
                    + "Set MAIL_ENABLED=true with a Gmail App Password to deliver reset emails.");
        }
    }

    private String buildResetLink(String rawToken) {
        String base = frontendBaseUrl != null ? frontendBaseUrl.replaceAll("/+$", "") : "";
        String path = passwordResetPath != null ? passwordResetPath : "/reset-password";
        if (!path.startsWith("/")) {
            path = "/" + path;
        }
        return base + path + "?token=" + rawToken;
    }

    @Override
    @Transactional
    public void resetPassword(ResetPasswordRequest request) {
        log.info("Processing password reset");

        PasswordResetToken resetToken = passwordResetTokenRepository
                .findByTokenHash(tokenProvider.hashToken(request.getToken()))
                .orElseThrow(() -> new UnauthorizedException("Invalid or expired reset token."));

        if (resetToken.getUsedAt() != null) {
            log.warn("Attempted use of already-used reset token");
            throw new UnauthorizedException("Invalid or expired reset token.");
        }

        if (resetToken.getExpiresAt().isBefore(Instant.now())) {
            log.warn("Expired reset token used");
            throw new UnauthorizedException("Invalid or expired reset token.");
        }

        User user = resetToken.getUser();
        if (!User.STATUS_ACTIVE.equalsIgnoreCase(user.getStatus())) {
            throw new UnauthorizedException("User account is no longer active.");
        }

        if (passwordEncoder.matches(request.getNewPassword(), user.getPasswordHash())) {
            throw new BadRequestException("New password must be different from the current password.");
        }

        int marked = passwordResetTokenRepository.markAsUsed(resetToken.getResetTokenId(), Instant.now());
        if (marked == 0) {
            throw new UnauthorizedException("Invalid or expired reset token.");
        }

        Instant now = Instant.now();
        user.setPasswordHash(passwordEncoder.encode(request.getNewPassword()));
        user.setPasswordChangedAt(now);
        userRepository.save(user);
        refreshTokenRepository.revokeAllByUserId(user.getUserId(), now);
        passwordResetTokenRepository.invalidateAllActiveByUserId(user.getUserId(), now);

        log.info("Password reset successfully for user ID: {}", user.getUserId());
    }

    @Override
    @Transactional
    public void changePassword(ChangePasswordRequest request, UserPrincipal currentUser) {
        log.info("Changing password for user ID: {}", currentUser.getId());

        User user = userRepository.findById(currentUser.getId())
                .orElseThrow(() -> new ResourceNotFoundException("User not found."));

        if (!User.STATUS_ACTIVE.equalsIgnoreCase(user.getStatus())) {
            throw new UnauthorizedException("User account is no longer active.");
        }

        if (!passwordEncoder.matches(request.getCurrentPassword(), user.getPasswordHash())) {
            throw new UnauthorizedException("Current password is incorrect.");
        }

        if (request.getCurrentPassword().equals(request.getNewPassword())
                || passwordEncoder.matches(request.getNewPassword(), user.getPasswordHash())) {
            throw new BadRequestException("New password must be different from the current password.");
        }

        Instant now = Instant.now();
        user.setPasswordHash(passwordEncoder.encode(request.getNewPassword()));
        user.setPasswordChangedAt(now);
        userRepository.save(user);
        refreshTokenRepository.revokeAllByUserId(user.getUserId(), now);
        passwordResetTokenRepository.invalidateAllActiveByUserId(user.getUserId(), now);

        log.info("Password changed successfully for user ID: {}", user.getUserId());
    }

    private RefreshToken newRefreshToken(User user, String rawToken) {
        return RefreshToken.builder()
                .user(user)
                .tokenHash(tokenProvider.hashToken(rawToken))
                .expiresAt(Instant.now().plusMillis(JwtTokenProvider.REFRESH_TOKEN_EXPIRATION_MS))
                .build();
    }

    private static String normalizeEmail(String email) {
        return email == null ? null : email.trim().toLowerCase(Locale.ROOT);
    }
}
