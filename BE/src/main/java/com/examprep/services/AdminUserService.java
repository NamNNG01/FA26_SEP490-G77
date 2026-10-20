package com.examprep.services;

import com.examprep.dto.AdminUserPageResponse;

/**
 * Admin user management (SRS 8.1 / 8.2). Every method is ADMIN-only.
 */
public interface AdminUserService {

    /**
     * UM-01: paged user list with search, role and status filters plus overview counters.
     */
    AdminUserPageResponse list(String search, String role, String status, int page, int size);
}
