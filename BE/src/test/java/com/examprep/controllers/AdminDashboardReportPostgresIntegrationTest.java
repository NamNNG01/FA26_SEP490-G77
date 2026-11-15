package com.examprep.controllers;

import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.springframework.test.context.ActiveProfiles;

/**
 * Runs the DASH-04 report suite against a real PostgreSQL, so its JPQL aggregations are validated
 * on the production dialect (the H2 run covers the logic). Requires
 * {@code -DpostgresTests=true} and a database on the postgres-test profile.
 */
@EnabledIfSystemProperty(named = "postgresTests", matches = "true")
@ActiveProfiles(value = "postgres-test", inheritProfiles = false)
class AdminDashboardReportPostgresIntegrationTest extends AdminDashboardReportApiIntegrationTest {
}
