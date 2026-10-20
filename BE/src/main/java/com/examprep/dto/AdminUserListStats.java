package com.examprep.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * UM-01: overview counters shown above the admin user list.
 * Computed across every account, independent of the active filters.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AdminUserListStats {

    private long total;
    private long active;
    private long inactive;
    /** Accounts created since the start of the current month. */
    private long newThisMonth;
}
