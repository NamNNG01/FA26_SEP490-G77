package com.examprep.controllers;

import com.examprep.dto.*;
import com.examprep.services.AuthService;
import com.examprep.security.UserPrincipal;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/auth")
@RequiredArgsConstructor
@Tag(name = "Authentication", description = "User Authentication & Session Management APIs")
public class AuthController {

    private final AuthService authService;

    @PostMapping("/register")
    @Operation(summary = "AUTH-01: Register Student Account", description = "Registers a new user account. Role is strictly assigned to STUDENT.")
    public ResponseEntity<ApiResponse<UserResponse>> register(@Valid @RequestBody RegisterRequest request) {
        UserResponse response = authService.register(request);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(response, "Registration successful."));
    }

    @PostMapping("/login")
    @Operation(summary = "AUTH-02: User Login", description = "Authenticates credentials and returns Access Token (15m) and Refresh Token (7d).")
    public ResponseEntity<ApiResponse<LoginResponse>> login(@Valid @RequestBody LoginRequest request) {
        LoginResponse response = authService.login(request);
        return ResponseEntity.ok(ApiResponse.success(response, "Login successful."));
    }

    @PostMapping("/refresh")
    @Operation(summary = "AUTH-03: Refresh Token Rotation", description = "Exchanges a valid refresh token for a new Access Token and new Refresh Token pair.")
    public ResponseEntity<ApiResponse<TokenResponse>> refreshToken(@Valid @RequestBody RefreshTokenRequest request) {
        TokenResponse response = authService.refreshToken(request);
        return ResponseEntity.ok(ApiResponse.success(response, "Token refreshed successfully."));
    }

    @PostMapping("/logout")
    @Operation(summary = "AUTH-04: User Logout", description = "Revokes the active refresh token session.")
    public ResponseEntity<ApiResponse<Void>> logout(@Valid @RequestBody LogoutRequest request,
                                                    @AuthenticationPrincipal UserPrincipal currentUser) {
        authService.logout(request, currentUser);
        return ResponseEntity.ok(ApiResponse.success(null, "Logout successful."));
    }

    @PostMapping("/logout-all")
    @Operation(summary = "AUTH-05: Logout All Devices", description = "Revokes all active refresh token sessions for the logged-in user.")
    public ResponseEntity<ApiResponse<Void>> logoutAll(@AuthenticationPrincipal UserPrincipal currentUser) {
        authService.logoutAll(currentUser);
        return ResponseEntity.ok(ApiResponse.success(null, "All sessions have been logged out."));
    }

    @PostMapping("/password/forgot")
    @Operation(summary = "AUTH-06: Request Password Reset", description = "Sends a password-reset link if the account exists.")
    public ResponseEntity<ApiResponse<Void>> forgotPassword(@Valid @RequestBody ForgotPasswordRequest request) {
        authService.forgotPassword(request);
        return ResponseEntity.ok(ApiResponse.success(null, "If the email is registered, a password reset link has been sent."));
    }

    @PostMapping("/password/reset")
    @Operation(summary = "AUTH-07: Reset Password", description = "Resets the password using a valid, unused reset token.")
    public ResponseEntity<ApiResponse<Void>> resetPassword(@Valid @RequestBody ResetPasswordRequest request) {
        authService.resetPassword(request);
        return ResponseEntity.ok(ApiResponse.success(null, "Password reset successful."));
    }

    @PutMapping("/password/change")
    @Operation(summary = "AUTH-08: Change Password", description = "Changes the authenticated user's password and logs out all sessions.")
    public ResponseEntity<ApiResponse<Void>> changePassword(@Valid @RequestBody ChangePasswordRequest request,
                                                            @AuthenticationPrincipal UserPrincipal currentUser) {
        authService.changePassword(request, currentUser);
        return ResponseEntity.ok(ApiResponse.success(null, "Password changed successfully."));
    }
}
