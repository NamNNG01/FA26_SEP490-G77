package com.examprep.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public final class AdminUserRequests {
    private AdminUserRequests() {}

    /**
     * UM-03 body: every field is required. Admins cannot change their own
     * role or status (400); e-mail must be unique system-wide (409).
     */
    public record Update(@NotBlank @Size(max = 100) String fullName,
                         @NotBlank @Email @Size(max = 150) String email,
                         @NotBlank String role,
                         @NotBlank String status) {}

    /**
     * UM-04 body: activate or deactivate an account. Deactivating revokes
     * every active session; admins may not deactivate themselves.
     */
    public record StatusUpdate(@NotBlank String status) {}
}
