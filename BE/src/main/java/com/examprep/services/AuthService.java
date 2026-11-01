package com.examprep.services;

import com.examprep.dto.*;
import com.examprep.entities.User;
import com.examprep.security.UserPrincipal;

public interface AuthService {

    UserResponse register(RegisterRequest request);

    LoginResponse login(LoginRequest request);

    /**
     * AUTH-09: verifies a Google ID token, then links it to the account that
     * already owns the Google subject id or the verified email, or provisions a
     * new STUDENT account. Always answers with the same token pair AUTH-02 issues.
     */
    GoogleLoginResponse loginWithGoogle(GoogleLoginRequest request);

    TokenResponse refreshToken(RefreshTokenRequest request);

    void logout(LogoutRequest request, UserPrincipal currentUser);

    void logoutAll(UserPrincipal currentUser);

    void forgotPassword(ForgotPasswordRequest request);

    /**
     * Issues a reset token for the given account and sends the reset link by
     * e-mail. Shared by AUTH-06 (public forgot-password) and UM-05 (admin
     * triggered reset). Delivery failures are logged, never thrown.
     */
    void sendPasswordResetEmail(User user);

    void resetPassword(ResetPasswordRequest request);

    void changePassword(ChangePasswordRequest request, UserPrincipal currentUser);
}
