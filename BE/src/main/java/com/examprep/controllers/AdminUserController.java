package com.examprep.controllers;

import com.examprep.dto.ApiResponse;
import com.examprep.dto.PageResponse;
import com.examprep.dto.UserResponse;
import com.examprep.exceptions.BadRequestException;
import com.examprep.repositories.UserRepository;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.Locale;

// Not in the iteration-1 spec: C-06 requires managerId but the spec has no way to list course managers,
// so the Create Course dropdown needs this. Read-only; full user management belongs to the admin users module.
@RestController
@RequestMapping("/api/v1/admin/users")
@RequiredArgsConstructor
@PreAuthorize("hasRole('ADMIN')")
@Tag(name = "Admin Users")
public class AdminUserController {
    private final UserRepository users;

    @GetMapping
    @Operation(summary = "List users filtered by role/status (Create Course manager dropdown)")
    public ResponseEntity<ApiResponse<PageResponse<UserResponse>>> list(@RequestParam(required = false) String role,
            @RequestParam(required = false) String status, @RequestParam(required = false) String search,
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size) {
        if (page < 0 || size < 1 || size > 100)
            throw new BadRequestException("Page must be nonnegative and size must be 1-100.");
        String text = search == null ? "" : search.strip().toLowerCase(Locale.ROOT);
        String pattern = "%" + text.replace("!", "!!").replace("%", "!%").replace("_", "!_") + "%";
        var result = users.search(upper(role), upper(status), pattern,
                PageRequest.of(page, size, Sort.by("fullName").and(Sort.by("userId"))));
        return ResponseEntity.ok(ApiResponse.success(PageResponse.of(result, result.map(UserResponse::from).getContent())));
    }

    private static String upper(String value) {
        return value == null || value.isBlank() ? null : value.strip().toUpperCase(Locale.ROOT);
    }
}
