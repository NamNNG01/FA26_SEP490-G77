package com.examprep.controllers;

import com.examprep.entities.AiUsageLog;
import com.examprep.entities.Category;
import com.examprep.entities.Course;
import com.examprep.entities.Enrollment;
import com.examprep.entities.Payment;
import com.examprep.entities.SubscriptionPlan;
import com.examprep.entities.User;
import com.examprep.security.UserPrincipal;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * DASH-04: the admin dashboard report is aggregated from the live data — collected payments,
 * accounts, courses and settled AI usage logs — for the requested period.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class AdminDashboardReportApiIntegrationTest {

    private static final String BASE = "/api/v1/dashboard/admin/report";
    private static final ZoneId ZONE = ZoneId.systemDefault();
    /** Fixed day so the period bucketing is deterministic; the AI logs are moved onto it too. */
    private static final Instant WHEN = Instant.parse("2026-09-18T09:00:00Z");
    private static final Instant NEXT_DAY = WHEN.plus(1, ChronoUnit.DAYS);

    @Autowired MockMvc mvc;
    @Autowired EntityManager em;
    @Autowired ObjectMapper json;

    User admin;
    Course published;
    Course draft;
    SubscriptionPlan plan;

    @BeforeEach
    void fixtures() {
        User manager = account(User.ROLE_COURSE_MANAGER);
        User student = account(User.ROLE_STUDENT);
        admin = account(User.ROLE_ADMIN);
        published = course(manager, "AWS Certified Cloud Practitioner", true);
        draft = course(manager, "Azure Fundamentals", false);
        // features_json is NOT NULL in the migrated PostgreSQL schema (Hibernate marks it nullable).
        plan = SubscriptionPlan.builder().planName("AI Pro").price(new BigDecimal("200000"))
                .durationDays(30).aiTokenLimit(1_000_000).featuresJson("[]").isActive(true).sortOrder(1).build();
        em.persist(plan);
        em.persist(Enrollment.builder().course(published).user(student).status(Enrollment.STATUS_ACTIVE)
                .enrolledAt(WHEN).build());

        // Collected revenue: on the report day 500k + 100k (courses) and 200k (the plan), plus 300k
        // on the next day — enough to prove the bucketing separates the two days.
        payment(student, Payment.COURSE, published.getCourseId(), "500000", Payment.SUCCEEDED, WHEN, published.getTitle());
        payment(student, Payment.COURSE, published.getCourseId(), "300000", Payment.SUCCEEDED, NEXT_DAY, published.getTitle());
        payment(student, Payment.COURSE, draft.getCourseId(), "100000", Payment.SUCCEEDED, WHEN, draft.getTitle());
        payment(student, Payment.SUBSCRIPTION, plan.getPlanId(), "200000", Payment.SUCCEEDED, WHEN, plan.getPlanName());
        // Money that never arrived: neither row may reach the report.
        payment(student, Payment.COURSE, published.getCourseId(), "999999", Payment.FAILED, WHEN, published.getTitle());
        payment(student, Payment.COURSE, published.getCourseId(), "888888", Payment.PENDING, WHEN, published.getTitle());

        aiLog(student, "EXPLANATION", "SUCCESS", 1000, 2000);
        aiLog(student, "FLASHCARD_GENERATE", "PARTIAL", 500, 100);
        aiLog(student, "ESSAY_GRADING", "FAILED", 50, 10);
        aiLog(student, "QUIZ_GENERATION", "TIMEOUT", 20, 5);
        aiLog(student, "EXPLANATION", "PENDING", null, null); // in flight → never listed
        em.flush();
        // Auditing stamps createdAt with "now"; move the logs onto the report day for a fixed window.
        em.createNativeQuery("UPDATE ai_usage_logs SET created_at = :ts")
                .setParameter("ts", WHEN).executeUpdate();
        em.clear();
    }

    @Test
    void reportAggregatesRevenueUsersCoursesAndAiForOneDay() throws Exception {
        String day = WHEN.atZone(ZONE).toLocalDate().toString();
        JsonNode data = data(call(admin, get(BASE)
                .param("granularity", "day").param("from", day).param("to", day))
                .andExpect(status().isOk()));

        // Net revenue = collected payments of the day, after discounts: 600k courses + 200k plan.
        assertEquals(0, new BigDecimal("800000").compareTo(data.path("summary").path("netRevenue").decimalValue()));
        JsonNode series = data.path("revenueSeries");
        assertEquals(1, series.size());
        assertEquals(day, series.get(0).path("period").asText());
        assertEquals(0, new BigDecimal("600000").compareTo(series.get(0).path("courseSales").decimalValue()));
        assertEquals(0, new BigDecimal("200000").compareTo(series.get(0).path("aiSubscription").decimalValue()));

        JsonNode users = data.path("summary").path("users");
        assertEquals(3, users.path("total").asLong());
        assertEquals(1, users.path("students").asLong());
        assertEquals(1, users.path("courseManagers").asLong());
        assertEquals(1, users.path("admins").asLong());
        assertEquals(1, data.path("summary").path("courses").path("active").asLong());
        assertEquals(2, data.path("summary").path("courses").path("total").asLong());
        // Settled tokens only: SUCCESS 3000 + PARTIAL 600.
        assertEquals(3600, data.path("summary").path("ai").path("tokensUsed").asLong());

        JsonNode source = data.path("revenueBySource");
        assertEquals(0, new BigDecimal("600000").compareTo(source.path("courseSales").decimalValue()));
        assertEquals(0, new BigDecimal("200000").compareTo(source.path("aiSubscription").decimalValue()));
        assertEquals(1, source.path("aiPlans").size());
        assertEquals("AI Pro", source.path("aiPlans").get(0).path("plan").asText());
        assertEquals(0, new BigDecimal("200000").compareTo(source.path("aiPlans").get(0).path("revenue").decimalValue()));
        JsonNode selling = source.path("topSellingCourses");
        assertEquals(2, selling.size());
        assertEquals("AWS Certified Cloud Practitioner", selling.get(0).path("title").asText());
        assertEquals(0, new BigDecimal("500000").compareTo(selling.get(0).path("revenue").decimalValue()));
        assertEquals("Azure Fundamentals", selling.get(1).path("title").asText());
        assertEquals(0, new BigDecimal("100000").compareTo(selling.get(1).path("revenue").decimalValue()));

        // The AI log table: settled requests, newest first, labelled.
        JsonNode logs = data.path("aiLogs");
        assertEquals(4, logs.size());
        assertEquals(4, data.path("aiLogTotals").path("requests").asLong());
        assertEquals(2, data.path("aiLogTotals").path("failed").asLong());
        assertEquals(4, data.path("aiLogTotals").path("shown").asInt());
        for (JsonNode log : logs) {
            assertFalse(log.path("time").asText().isBlank(), "every row carries its local time");
            assertTrue(log.path("user").asText().length() > 0);
            assertTrue(log.path("feature").asText().length() > 0);
        }
        // Same created_at for all rows → the tie-breaker is the log id, so the newest insert leads.
        assertEquals("Quiz generation", logs.get(0).path("feature").asText());
        assertFalse(logs.get(0).path("success").asBoolean());
        assertEquals(25, logs.get(0).path("tokens").asLong());
        assertEquals("Answer grading", logs.get(1).path("feature").asText());
        assertFalse(logs.get(1).path("success").asBoolean());
        assertEquals("Flashcard generation", logs.get(2).path("feature").asText());
        assertTrue(logs.get(2).path("success").asBoolean());
        assertEquals(600, logs.get(2).path("tokens").asLong());
        assertEquals("Answer explanation", logs.get(3).path("feature").asText());
        assertEquals(3000, logs.get(3).path("tokens").asLong());

        // The picker's lower bound is the oldest account, i.e. today in this fixture.
        assertEquals(LocalDate.now(ZONE).toString(), data.path("dataStart").asText());
    }

    @Test
    void reportFillsEmptyPeriodsAndUsesTheRequestedBuckets() throws Exception {
        String day = WHEN.atZone(ZONE).toLocalDate().toString();
        String second = NEXT_DAY.atZone(ZONE).toLocalDate().toString();
        String third = NEXT_DAY.plus(1, ChronoUnit.DAYS).atZone(ZONE).toLocalDate().toString();

        // Day granularity: three buckets although nothing was paid on the third day.
        JsonNode daily = data(call(admin, get(BASE)
                .param("granularity", "day").param("from", day).param("to", third))
                .andExpect(status().isOk())).path("revenueSeries");
        assertEquals(3, daily.size());
        assertEquals(day, daily.get(0).path("period").asText());
        assertEquals(0, new BigDecimal("600000").compareTo(daily.get(0).path("courseSales").decimalValue()));
        assertEquals(second, daily.get(1).path("period").asText());
        assertEquals(0, new BigDecimal("300000").compareTo(daily.get(1).path("courseSales").decimalValue()));
        assertEquals(0, BigDecimal.ZERO.compareTo(daily.get(1).path("aiSubscription").decimalValue()));
        assertEquals(third, daily.get(2).path("period").asText());
        assertEquals(0, BigDecimal.ZERO.compareTo(daily.get(2).path("courseSales").decimalValue()));
        assertEquals(0, BigDecimal.ZERO.compareTo(daily.get(2).path("aiSubscription").decimalValue()));

        // Month granularity: the whole month is one bucket holding every paid row.
        String month = WHEN.atZone(ZONE).toLocalDate().toString().substring(0, 7);
        JsonNode monthly = data(call(admin, get(BASE)
                .param("granularity", "month").param("from", month).param("to", month))
                .andExpect(status().isOk())).path("revenueSeries");
        assertEquals(1, monthly.size());
        assertEquals(month, monthly.get(0).path("period").asText());
        assertEquals(0, new BigDecimal("900000").compareTo(monthly.get(0).path("courseSales").decimalValue()));

        // Year granularity: same totals under the year key.
        String year = month.substring(0, 4);
        JsonNode yearly = data(call(admin, get(BASE)
                .param("granularity", "year").param("from", year).param("to", year))
                .andExpect(status().isOk())).path("revenueSeries");
        assertEquals(1, yearly.size());
        assertEquals(year, yearly.get(0).path("period").asText());
        assertEquals(0, new BigDecimal("900000").compareTo(yearly.get(0).path("courseSales").decimalValue()));
    }

    @Test
    void topCoursesRankByTheRequestedMetricFromLifetimeData() throws Exception {
        String day = WHEN.atZone(ZONE).toLocalDate().toString();
        JsonNode byRevenue = data(call(admin, get(BASE)
                .param("granularity", "day").param("from", day).param("to", day)
                .param("sortBy", "revenue")).andExpect(status().isOk())).path("topCourses");
        assertEquals(2, byRevenue.size());
        assertEquals(published.getCourseId(), byRevenue.get(0).path("courseId").asLong());
        assertEquals("PUBLISHED", byRevenue.get(0).path("status").asText());
        assertEquals(0, new BigDecimal("800000").compareTo(byRevenue.get(0).path("revenue").decimalValue()));
        assertEquals(1, byRevenue.get(0).path("enrollments").asLong());
        assertEquals("DRAFT", byRevenue.get(1).path("status").asText());

        JsonNode byEnrollments = data(call(admin, get(BASE)
                .param("granularity", "day").param("from", day).param("to", day)
                .param("sortBy", "enrollments")).andExpect(status().isOk())).path("topCourses");
        assertEquals(published.getCourseId(), byEnrollments.get(0).path("courseId").asLong());
        assertEquals(1, byEnrollments.get(0).path("enrollments").asLong());
    }

    @Test
    void reportIsAdminOnlyAndValidatesItsParameters() throws Exception {
        String day = WHEN.atZone(ZONE).toLocalDate().toString();
        mvc.perform(get(BASE).param("from", day).param("to", day)).andExpect(status().isUnauthorized());
        call(account(User.ROLE_STUDENT), get(BASE).param("from", day).param("to", day))
                .andExpect(status().isForbidden());
        call(account(User.ROLE_COURSE_MANAGER), get(BASE).param("from", day).param("to", day))
                .andExpect(status().isForbidden());

        call(admin, get(BASE).param("granularity", "week").param("from", day).param("to", day))
                .andExpect(status().isBadRequest());
        call(admin, get(BASE).param("granularity", "day").param("from", day).param("to", day)
                .param("sortBy", "score")).andExpect(status().isBadRequest());
        call(admin, get(BASE).param("granularity", "day").param("from", day))
                .andExpect(status().isBadRequest());
        call(admin, get(BASE).param("granularity", "day").param("from", day).param("to", day)
                .param("sortBy", "enrollments")).andExpect(status().isOk());
        call(admin, get(BASE).param("granularity", "day").param("from", "not-a-date").param("to", day))
                .andExpect(status().isBadRequest());
        call(admin, get(BASE).param("granularity", "day").param("from", day).param("to", "2026-09-17"))
                .andExpect(status().isBadRequest());
    }

    // =================================================================================
    // fixtures
    // =================================================================================

    private User account(String role) {
        User user = User.builder().email(UUID.randomUUID() + "@example.com").fullName(role + " user")
                .passwordHash("test").roleName(role).build();
        em.persist(user);
        return user;
    }

    private Course course(User manager, String title, boolean published) {
        Category category = Category.builder().name("Category " + UUID.randomUUID()).slug(UUID.randomUUID().toString()).build();
        em.persist(category);
        Course course = Course.builder().categoryId(category.getCategoryId()).category(category).manager(manager)
                .title(title).slug(UUID.randomUUID().toString()).price(BigDecimal.ZERO).isPublished(published).build();
        em.persist(course);
        return course;
    }

    private void payment(User user, String type, Long refId, String amount, String status,
                         Instant paidAt, String title) {
        em.persist(Payment.builder()
                .user(user)
                .orderCode(type + "-" + refId + "-" + UUID.randomUUID())
                .type(type).refId(refId).amount(new BigDecimal(amount)).currency("VND")
                .status(status).discountAmount(BigDecimal.ZERO).title(title)
                .paidAt(paidAt).createdAt(paidAt).updatedAt(paidAt)
                .build());
    }

    private void aiLog(User user, String purpose, String status, Integer input, Integer output) {
        em.persist(AiUsageLog.builder().user(user).purpose(purpose).status(status)
                .inputTokens(input).outputTokens(output).reservedTokens(0).build());
    }

    private ResultActions call(User actor, MockHttpServletRequestBuilder request) throws Exception {
        em.flush();
        return mvc.perform(request.with(user(UserPrincipal.create(actor))));
    }

    private JsonNode data(ResultActions actions) throws Exception {
        return json.readTree(actions.andReturn().getResponse().getContentAsString()).path("data");
    }
}
