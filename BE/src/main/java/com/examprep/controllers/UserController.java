package com.examprep.controllers;

import com.examprep.dto.ApiResponse;
import com.examprep.dto.UpdateProfileRequest;
import com.examprep.dto.UserResponse;
import com.examprep.security.UserPrincipal;
import com.examprep.services.UserService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/users")
@RequiredArgsConstructor
@Tag(name = "Users", description = "Current user profile APIs")
public class UserController {

    private final UserService userService;

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
}
