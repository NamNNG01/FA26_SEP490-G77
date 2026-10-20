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
}
