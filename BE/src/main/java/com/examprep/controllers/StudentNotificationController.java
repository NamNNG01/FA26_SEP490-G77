package com.examprep.controllers;

import com.examprep.dto.ApiResponse;
import com.examprep.dto.StudentNotificationResponse;
import com.examprep.security.UserPrincipal;
import com.examprep.services.StudentNotificationService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/student/notifications")
@RequiredArgsConstructor
@Tag(name = "Student Notifications")
public class StudentNotificationController {
    private final StudentNotificationService service;

    @GetMapping
    @Operation(summary = "NT-01: List notifications")
    public ResponseEntity<ApiResponse<StudentNotificationResponse.Inbox>> list(
            @AuthenticationPrincipal UserPrincipal user,
            @RequestParam(defaultValue = "false") boolean unreadOnly,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return ResponseEntity.ok(ApiResponse.success(service.list(user.getId(), unreadOnly, page, size)));
    }

    @PostMapping("/{notificationId}/read")
    @Operation(summary = "NT-02: Mark notification as read")
    public ResponseEntity<ApiResponse<StudentNotificationResponse.Read>> markRead(
            @AuthenticationPrincipal UserPrincipal user, @PathVariable Long notificationId) {
        return ResponseEntity.ok(ApiResponse.success(service.markRead(user.getId(), notificationId)));
    }

    @PostMapping("/read-all")
    @Operation(summary = "NT-03: Mark all notifications as read")
    public ResponseEntity<ApiResponse<StudentNotificationResponse.ReadAll>> markAllRead(
            @AuthenticationPrincipal UserPrincipal user) {
        return ResponseEntity.ok(ApiResponse.success(service.markAllRead(user.getId())));
    }
}
