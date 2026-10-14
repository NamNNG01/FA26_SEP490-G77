package com.examprep.services;

import com.examprep.dto.UpdateProfileRequest;
import com.examprep.dto.UserResponse;

public interface UserService {

    UserResponse getCurrentUser(Long userId);

    UserResponse updateProfile(Long userId, UpdateProfileRequest request);
}
