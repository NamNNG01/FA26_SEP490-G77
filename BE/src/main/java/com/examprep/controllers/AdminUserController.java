package com.examprep.controllers;

import com.examprep.dto.AdminUserDetailResponse;
import com.examprep.dto.AdminUserPageResponse;
import com.examprep.dto.AdminUserRequests;
import com.examprep.dto.AdminUserResponse;
import com.examprep.dto.ApiResponse;
import com.examprep.security.UserPrincipal;
import com.examprep.services.AdminUserService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/admin/users")
@RequiredArgsConstructor
@PreAuthorize("hasRole('ADMIN')")
@Tag(name = "Admin Users")
public class AdminUserController {

    private final AdminUserService service;

    @GetMapping
    @Operation(summary = "UM-01: Search, filter and paginate the user list with overview counters",
            description = "ADMIN only. Powers the User List screen and the Course Manager dropdown "
                    + "(use role=COURSE_MANAGER for the latter).")
    public ResponseEntity<ApiResponse<AdminUserPageResponse>> list(
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String role,
            @RequestParam(required = false) String status,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return ResponseEntity.ok(ApiResponse.success(service.list(search, role, status, page, size)));
    }

    @GetMapping("/{id}")
    @Operation(summary = "UM-02: User detail with learning statistics and recent attempts",
            description = "ADMIN only. Powers the User Detail screen (quick profile, learning stats, recent attempts).")
    public ResponseEntity<ApiResponse<AdminUserDetailResponse>> detail(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.success(service.detail(id)));
    }

    @PutMapping("/{id}")
    @Operation(summary = "UM-03: Update a user's full name, e-mail, role and status",
            description = "ADMIN only. All four fields are required. Admins cannot change their own role or status; "
                    + "a duplicate e-mail returns 409; switching to INACTIVE revokes every active session.")
    public ResponseEntity<ApiResponse<AdminUserResponse>> update(@AuthenticationPrincipal UserPrincipal actor,
            @PathVariable Long id, @Valid @RequestBody AdminUserRequests.Update request) {
        return ResponseEntity.ok(ApiResponse.success(service.update(actor, id, request)));
    }
}
