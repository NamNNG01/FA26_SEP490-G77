package com.examprep.domain.auth.service;

import com.examprep.common.exception.BadRequestException;
import com.examprep.common.exception.ResourceNotFoundException;
import com.examprep.common.exception.UnauthorizedException;
import com.examprep.domain.auth.dto.*;
import com.examprep.domain.auth.entity.RefreshToken;
import com.examprep.domain.auth.repository.RefreshTokenRepository;
import com.examprep.domain.user.entity.Role;
import com.examprep.domain.user.entity.User;
import com.examprep.domain.user.repository.RoleRepository;
import com.examprep.domain.user.repository.UserRepository;
import com.examprep.security.JwtTokenProvider;
import com.examprep.security.UserPrincipal;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;

@Slf4j
@Service
@RequiredArgsConstructor
public class AuthServiceImpl implements AuthService {

    private final UserRepository userRepository;
    private final RoleRepository roleRepository;
    private final RefreshTokenRepository refreshTokenRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtTokenProvider tokenProvider;

    @Override
    @Transactional
    public UserResponse register(RegisterRequest request) {
        String email = normalizeEmail(request.getEmail());
        log.info("Registering new user with email: {}", email);

        if (userRepository.existsByEmail(email)) {
            throw new BadRequestException("Email is already registered.");
        }

        // Always assign STUDENT role for registration
        Role studentRole = roleRepository.findByRoleCode("STUDENT")
                .orElseThrow(() -> new ResourceNotFoundException("Default STUDENT role not found in database."));

        User user = User.builder()
                .email(email)
                .passwordHash(passwordEncoder.encode(request.getPassword()))
                .fullName(request.getFullName().trim())
                .role(studentRole)
                .status("ACTIVE")
                .build();

        User savedUser = userRepository.save(user);
        log.info("User registered successfully with ID: {}", savedUser.getUserId());
        return UserResponse.from(savedUser);
    }

    @Override
    @Transactional
    public LoginResponse login(LoginRequest request) {
        String email = normalizeEmail(request.getEmail());
        log.info("Authenticating user: {}", email);

        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new UnauthorizedException("Invalid email or password."));

        if (!passwordEncoder.matches(request.getPassword(), user.getPasswordHash())) {
            throw new UnauthorizedException("Invalid email or password.");
        }

        if (!"ACTIVE".equalsIgnoreCase(user.getStatus())) {
            throw new UnauthorizedException("User account is inactive or blocked.");
        }

        // Generate Access Token & Refresh Token
        String accessToken = tokenProvider.generateAccessToken(user);
        String rawRefreshToken = tokenProvider.generateRawRefreshToken();
        String hashedRefreshToken = tokenProvider.hashToken(rawRefreshToken);

        Instant expiresAt = Instant.now().plusMillis(JwtTokenProvider.REFRESH_TOKEN_EXPIRATION_MS);

        RefreshToken refreshTokenEntity = RefreshToken.builder()
                .user(user)
                .tokenHash(hashedRefreshToken)
                .expiresAt(expiresAt)
                .build();

        refreshTokenRepository.save(refreshTokenEntity);

        log.info("User {} logged in successfully.", user.getEmail());

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

        String hashedInputToken = tokenProvider.hashToken(request.getRefreshToken());

        RefreshToken refreshTokenEntity = refreshTokenRepository.findByTokenHash(hashedInputToken)
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
        if (!"ACTIVE".equalsIgnoreCase(user.getStatus())) {
            throw new UnauthorizedException("User account is no longer active.");
        }

        // 1. Revoke current refresh token (Rotation)
        refreshTokenEntity.setRevokedAt(Instant.now());
        refreshTokenRepository.save(refreshTokenEntity);

        // 2. Generate new token pair
        String newAccessToken = tokenProvider.generateAccessToken(user);
        String newRawRefreshToken = tokenProvider.generateRawRefreshToken();
        String newHashedRefreshToken = tokenProvider.hashToken(newRawRefreshToken);

        Instant newExpiresAt = Instant.now().plusMillis(JwtTokenProvider.REFRESH_TOKEN_EXPIRATION_MS);

        RefreshToken newRefreshTokenEntity = RefreshToken.builder()
                .user(user)
                .tokenHash(newHashedRefreshToken)
                .expiresAt(newExpiresAt)
                .build();

        refreshTokenRepository.save(newRefreshTokenEntity);

        log.info("Refresh Token Rotation completed for user: {}", user.getEmail());

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

    private String normalizeEmail(String email) {
        return email == null ? null : email.trim().toLowerCase();
    }
}
