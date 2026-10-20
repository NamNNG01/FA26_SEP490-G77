package com.examprep.controllers;

import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.springframework.test.context.ActiveProfiles;

@EnabledIfSystemProperty(named = "postgresTests", matches = "true")
@ActiveProfiles(value = "postgres-test", inheritProfiles = false)
class CategoryPostgresIntegrationTest extends CategoryApiIntegrationTest {}
