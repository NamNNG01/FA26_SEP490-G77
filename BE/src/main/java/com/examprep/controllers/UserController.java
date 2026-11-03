package com.examprep.controllers;

import com.examprep.dto.ApiResponse;
import com.examprep.dto.UpdateProfileRequest;
import com.examprep.dto.UserResponse;
import com.examprep.security.UserPrincipal;
import com.examprep.exceptions.BadRequestException;
import com.examprep.services.MaterialStorage;
import com.examprep.services.UserService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;

@RestController
@RequestMapping("/api/v1/users")
@RequiredArgsConstructor
@Tag(name = "Users", description = "Current user profile APIs")
public class UserController {

    private final UserService userService;
    private final MaterialStorage storage;

    @GetMapping("/me")
    @Operation(summary = "USER-01: Get Current User", description = "Returns the profile of the logged-in user.")
    public ResponseEntity<ApiResponse<UserResponse>> getCurrentUser(
            @AuthenticationPrincipal UserPrincipal currentUser) {
        UserResponse response = userService.getCurrentUser(currentUser.getId());
        return ResponseEntity.ok(ApiResponse.success(response, null));
    }

    @PutMapping("/me")
    @Operation(summary = "USER-02: Update Profile", description = "Updates fullName and/or avatarUrl of the logged-in user. Email, role, status and password cannot be changed here.")
    public ResponseEntity<ApiResponse<UserResponse>> updateProfile(
            @Valid @RequestBody UpdateProfileRequest request,
            @AuthenticationPrincipal UserPrincipal currentUser) {
        UserResponse response = userService.updateProfile(currentUser.getId(), request);
        return ResponseEntity.ok(ApiResponse.success(response, "Profile updated successfully."));
    }

    @PostMapping(value = "/me/avatar", consumes = "multipart/form-data")
    @Operation(summary = "USER-03: Upload avatar", description = "JPG/PNG/WEBP/GIF up to 5MB, stored on Cloudinary; replaces the previous avatar.")
    public ResponseEntity<ApiResponse<UserResponse>> uploadAvatar(
            @RequestParam MultipartFile file,
            @AuthenticationPrincipal UserPrincipal currentUser) {
        // Fixed publicId + overwrite: a new avatar replaces the old file, nothing is left behind.
        MaterialStorage.StoredImage image = storage.storeImage("avatars/user" + currentUser.getId(), bytes(file), true);
        return ResponseEntity.ok(ApiResponse.success(userService.setAvatar(currentUser.getId(), image.url()), "Avatar updated successfully."));
    }

    static byte[] bytes(MultipartFile file) {
        try {
            return file.getBytes();
        } catch (IOException ex) {
            throw new BadRequestException("Could not read the uploaded file.");
        }
    }
}
