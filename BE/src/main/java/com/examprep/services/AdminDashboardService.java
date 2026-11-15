package com.examprep.services;

import com.examprep.dto.AdminDashboardReport;

/** DASH-04: the admin dashboard report, aggregated from the live platform data. */
public interface AdminDashboardService {

    /**
     * @param granularity {@code day}, {@code month} or {@code year} (default {@code day})
     * @param from        inclusive first period, in the granularity's own format
     *                    ({@code YYYY-MM-DD}, {@code YYYY-MM} or {@code YYYY})
     * @param to          inclusive last period, same format
     * @param sortBy      {@code revenue} or {@code enrollments} (default {@code revenue}),
     *                    ranks the all-time top courses
     */
    AdminDashboardReport report(String granularity, String from, String to, String sortBy);
}
