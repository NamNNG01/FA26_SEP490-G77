package com.examprep.domain.auth.service;

import com.examprep.domain.auth.dto.*;
import com.examprep.security.UserPrincipal;

public interface AuthService {

    UserResponse register(RegisterRequest request);

    LoginResponse login(LoginRequest request);

    TokenResponse refreshToken(RefreshTokenRequest request);

    void logout(LogoutRequest request, UserPrincipal currentUser);

    void logoutAll(UserPrincipal currentUser);
}
