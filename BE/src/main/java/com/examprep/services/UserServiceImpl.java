package com.examprep.services;

import com.examprep.dto.UpdateProfileRequest;
import com.examprep.dto.UserResponse;
import com.examprep.entities.User;
import com.examprep.exceptions.BadRequestException;
import com.examprep.exceptions.ResourceNotFoundException;
import com.examprep.repositories.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Slf4j
@Service
@RequiredArgsConstructor
public class UserServiceImpl implements UserService {

    private final UserRepository userRepository;

    @Override
    @Transactional(readOnly = true)
    public UserResponse getCurrentUser(Long userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User not found."));
        return UserResponse.from(user);
    }

    @Override
    @Transactional
    public UserResponse updateProfile(Long userId, UpdateProfileRequest request) {
        boolean hasFullName = request.getFullName() != null;
        boolean hasAvatarUrl = request.getAvatarUrl() != null;
        if (!hasFullName && !hasAvatarUrl) {
            throw new BadRequestException("At least one of fullName or avatarUrl must be provided.");
        }

        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User not found."));

        if (hasFullName) {
            String fullName = request.getFullName().trim();
            if (fullName.isEmpty()) {
                throw new BadRequestException("Full name must not be blank.");
            }
            user.setFullName(fullName);
        }

        if (hasAvatarUrl) {
            String avatarUrl = request.getAvatarUrl().trim();
            user.setAvatarUrl(avatarUrl.isEmpty() ? null : avatarUrl);
        }

        User savedUser = userRepository.save(user);
        log.info("Profile updated for user ID: {}", savedUser.getUserId());
        return UserResponse.from(savedUser);
    }
}
