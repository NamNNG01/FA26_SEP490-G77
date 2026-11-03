package com.examprep.services;

import com.examprep.dto.UpdateProfileRequest;
import com.examprep.dto.UserResponse;

public interface UserService {

    UserResponse getCurrentUser(Long userId);

    UserResponse updateProfile(Long userId, UpdateProfileRequest request);

    /** USER-03: stores an already-uploaded avatar URL on the user. */
    UserResponse setAvatar(Long userId, String avatarUrl);
}
