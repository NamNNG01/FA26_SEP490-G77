package com.examprep.services;

import com.examprep.dto.*;
import com.examprep.security.UserPrincipal;

public interface AuthService {

    UserResponse register(RegisterRequest request);

    LoginResponse login(LoginRequest request);

    TokenResponse refreshToken(RefreshTokenRequest request);

    void logout(LogoutRequest request, UserPrincipal currentUser);

    void logoutAll(UserPrincipal currentUser);

    void forgotPassword(ForgotPasswordRequest request);

    void resetPassword(ResetPasswordRequest request);

    void changePassword(ChangePasswordRequest request, UserPrincipal currentUser);
}
