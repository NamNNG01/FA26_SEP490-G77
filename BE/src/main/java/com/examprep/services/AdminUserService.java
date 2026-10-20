package com.examprep.services;

import com.examprep.dto.AdminUserDetailResponse;
import com.examprep.dto.AdminUserPageResponse;
import com.examprep.dto.AdminUserRequests;
import com.examprep.dto.AdminUserResponse;
import com.examprep.security.UserPrincipal;

/**
 * Admin user management (SRS 8.1 / 8.2). Every method is ADMIN-only.
 */
public interface AdminUserService {

    /**
     * UM-01: paged user list with search, role and status filters plus overview counters.
     */
    AdminUserPageResponse list(String search, String role, String status, int page, int size);

    /**
     * UM-02: full profile with learning statistics and recent attempts.
     */
    AdminUserDetailResponse detail(Long id);

    /**
     * UM-03: update full name, e-mail, role and status. All four fields are
     * required. Switching the account to INACTIVE revokes every session.
     */
    AdminUserResponse update(UserPrincipal actor, Long id, AdminUserRequests.Update request);

    /**
     * UM-04: activate or deactivate an account. Deactivating revokes every
     * active session; admins may not deactivate themselves.
     */
    AdminUserResponse updateStatus(UserPrincipal actor, Long id, AdminUserRequests.StatusUpdate request);

    /**
     * UM-05: send the password-reset e-mail to the given account, reusing the
     * AUTH-06 token flow. Always completes with 200; mail delivery problems
     * are logged by the auth service, never surfaced.
     */
    void resetPassword(Long id);
}
