package com.examprep.controllers;

import com.examprep.dto.AdminPlanDtos.*;
import com.examprep.dto.PageResponse;
import com.examprep.dto.ResponseCode;
import com.examprep.entities.SubscriptionPlan;
import com.examprep.entities.User;
import com.examprep.entities.UserSubscription;
import com.examprep.exceptions.BaseException;
import com.examprep.repositories.SubscriptionPlanRepository;
import com.examprep.repositories.UserRepository;
import com.examprep.repositories.UserSubscriptionRepository;
import com.examprep.services.admin.AdminSubscriptionPlanService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static com.examprep.controllers.student.Fixtures.as;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Group C (admin subscription-plan config) — API 20/21 list + detail and the public plan list
 * feeding API 27, asserted both through the service (business contract) and over HTTP (routing,
 * status codes, auth and the error envelope produced by {@code GlobalExceptionHandler}).
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class AdminSubscriptionPlanApiTest {

    @Autowired MockMvc mvc;
    @Autowired AdminSubscriptionPlanService service;
    @Autowired SubscriptionPlanRepository planRepository;
    @Autowired UserSubscriptionRepository subscriptionRepository;
    @Autowired UserRepository userRepository;
    @Autowired EntityManager em;
    @Autowired ObjectMapper json;

    User admin, subscriberOne, subscriberTwo, subscriberThree, subscriberFour;
    SubscriptionPlan planA, planB, planC, planD;

    @BeforeEach
    void setUp() {
        admin = account(User.ROLE_ADMIN);
        subscriberOne = account(User.ROLE_STUDENT);
        subscriberTwo = account(User.ROLE_STUDENT);
        subscriberThree = account(User.ROLE_STUDENT);
        subscriberFour = account(User.ROLE_STUDENT);

        // A: active, sortOrder 1, features are trimmed/de-blanked on read.
        planA = plan("Plan A", true, 1, "[\"AI quizzes\", \" Offline notes \", \"\", null]");
        // B: active, sortOrder 2.
        planB = plan("Plan B", true, 2, "[]");
        // C: inactive — still visible in the ADMIN list, hidden from the public list.
        planC = plan("Plan C", false, 3, null);
        // D: soft-deleted — never visible.
        planD = plan("Plan D", true, 4, "[\"Gone\"]");
        planD.setDeletedAt(Instant.now());
        planRepository.save(planD);
        em.flush();

        Instant now = Instant.now();
        // Plan A: 2 ACTIVE subscriptions inside their paid window + 1 EXPIRED.
        subscription(subscriberOne, planA, now.minus(5, ChronoUnit.DAYS), now.plus(25, ChronoUnit.DAYS), "ACTIVE");
        subscription(subscriberTwo, planA, now.minus(1, ChronoUnit.DAYS), now.plus(29, ChronoUnit.DAYS), "ACTIVE");
        subscription(subscriberThree, planA, now.minus(60, ChronoUnit.DAYS), now.minus(30, ChronoUnit.DAYS), "EXPIRED");
        // Plan B: 1 ACTIVE subscription.
        subscription(subscriberFour, planB, now.minus(3, ChronoUnit.DAYS), now.plus(27, ChronoUnit.DAYS), "ACTIVE");
        em.flush();
        em.clear();
    }

    @Test
    void listReturnsActiveBeforeInactiveOrderedBySortOrderWithCounts() {
        PageResponse<PlanItem> all = service.listPage(null, null, 0, 20, "sortOrder,asc");

        assertEquals(List.of("Plan A", "Plan B", "Plan C"), names(all.getContent()));
        assertEquals(2L, all.getContent().get(0).activeSubscribers());
        assertEquals(1L, all.getContent().get(1).activeSubscribers());
        assertFalse(all.getContent().get(2).isActive(), "inactive plans stay visible for admins");
        assertTrue(all.getContent().stream().noneMatch(i -> "Plan D".equals(i.planName())), "soft-deleted plan must not leak");

        PlanItem aItem = all.getContent().get(0);
        assertEquals("VND", aItem.currency());
        assertEquals(List.of("AI quizzes", "Offline notes"), aItem.features());
        assertEquals(new BigDecimal("99000").compareTo(aItem.price()), 0);
        assertEquals(30, aItem.durationDays());
        assertEquals(200000, aItem.aiTokenLimit());

        // isActive is an exact filter.
        assertEquals(List.of("Plan C"), names(service.list(null, false, 0, 20, "sortOrder,asc").getContent()));
        // Unknown sort property falls back to sortOrder,asc.
        assertEquals(List.of("Plan A", "Plan B", "Plan C"),
                names(service.list(null, null, 0, 20, "notAColumn,desc").getContent()));
        // A whitelisted property without an explicit direction defaults to ASC (not DESC).
        assertEquals(List.of("Plan A", "Plan B", "Plan C"),
                names(service.list(null, null, 0, 20, "planName").getContent()));
        // Size is clamped to 100.
        assertEquals(100, service.list(null, null, 0, 500, "sortOrder,asc").getSize());
        // features_json round-trips through the same normalization (used by create/update in Task 4).
        assertEquals(List.of("A", "B"), service.readFeatures(service.writeFeatures(java.util.Arrays.asList(" A ", "", null, "B"))));
    }

    @Test
    void listPaginatesAndSearchesCaseInsensitive() {
        PageResponse<PlanItem> firstPage = service.listPage(null, null, 0, 1, "sortOrder,asc");
        assertEquals(1, firstPage.getContent().size());
        assertEquals("Plan A", firstPage.getContent().get(0).planName());
        assertEquals(3L, firstPage.getTotalElements());
        assertEquals(3, firstPage.getTotalPages());
        assertTrue(firstPage.isFirst());
        assertFalse(firstPage.isLast());

        PageResponse<PlanItem> lastPage = service.listPage(null, null, 2, 1, "sortOrder,asc");
        assertEquals("Plan C", lastPage.getContent().get(0).planName());
        assertTrue(lastPage.isLast());

        // Keyword is trimmed + case-insensitive and matches on planName only.
        PageResponse<PlanItem> keyword = service.listPage("  plan a  ", null, 0, 20, "sortOrder,asc");
        assertEquals(List.of("Plan A"), names(keyword.getContent()));
        assertEquals(0, service.list("plan z", null, 0, 20, "sortOrder,asc").getContent().size());

        // Envelope field names of PageResponse (consumed by the FE in Task 6).
        JsonNode pageJson = json.valueToTree(firstPage);
        for (String field : List.of("content", "page", "size", "totalElements", "totalPages", "first", "last")) {
            assertTrue(pageJson.has(field), "PageResponse must serialize " + field);
        }
    }

    @Test
    void detailReturnsAllFieldsIncludingSubscriberCounts() {
        PlanDetail detail = service.detail(planA.getPlanId());

        assertEquals(planA.getPlanId(), detail.planId());
        assertEquals("Plan A", detail.planName());
        assertEquals(new BigDecimal("99000").compareTo(detail.price()), 0);
        assertEquals("VND", detail.currency());
        assertEquals(30, detail.durationDays());
        assertEquals(200000, detail.aiTokenLimit());
        assertEquals(List.of("AI quizzes", "Offline notes"), detail.features());
        assertTrue(detail.isActive());
        assertEquals(1, detail.sortOrder());
        assertEquals(2L, detail.activeSubscribers());
        assertEquals(3L, detail.totalSubscribers(), "ACTIVE + EXPIRED rows both count as total");
        assertNotNull(detail.createdAt());
        assertNotNull(detail.updatedAt());
    }

    @Test
    void detailUnknownPlanReturns404PlanNotFound() {
        BaseException missing = assertThrows(BaseException.class, () -> service.detail(999_999L));
        assertEquals(ResponseCode.RESOURCE_NOT_FOUND, missing.getResponseCode());
        assertEquals(404, missing.getResponseCode().getHttpStatus().value());
        assertEquals("PLAN_NOT_FOUND", ((Map<?, ?>) missing.getData()).get("code"));
        assertFalse(missing.getMessage().isBlank());

        // Soft-deleted plans behave like missing ones.
        BaseException deleted = assertThrows(BaseException.class, () -> service.detail(planD.getPlanId()));
        assertEquals(ResponseCode.RESOURCE_NOT_FOUND, deleted.getResponseCode());
        assertEquals("PLAN_NOT_FOUND", ((Map<?, ?>) deleted.getData()).get("code"));
    }

    @Test
    void publicListShowsOnlyActiveSortedBySortOrder() {
        List<PublicPlanItem> published = service.publicList();

        assertEquals(List.of("Plan A", "Plan B"), published.stream().map(PublicPlanItem::planName).toList());
        assertEquals(List.of(1, 2), published.stream().map(PublicPlanItem::sortOrder).toList());
        assertTrue(published.stream().allMatch(p -> Boolean.TRUE.equals(p.isActive())));
        assertTrue(published.stream().noneMatch(p -> "Plan C".equals(p.planName())), "inactive plan is hidden");
        assertTrue(published.stream().noneMatch(p -> "Plan D".equals(p.planName())), "deleted plan is hidden");
        assertEquals("VND", published.get(0).currency());
        assertEquals(List.of("AI quizzes", "Offline notes"), published.get(0).features());
    }

    @Test
    void featuresJsonSurvivesDatabaseRoundTrip() {
        SubscriptionPlan plan = SubscriptionPlan.builder().planName("Round trip plan").price(new BigDecimal("1000"))
                .durationDays(30).aiTokenLimit(1000).description("round trip")
                .featuresJson(service.writeFeatures(List.of("A", "B"))).isActive(true).sortOrder(9).build();
        Long planId = planRepository.saveAndFlush(plan).getPlanId();

        em.clear();
        SubscriptionPlan reloaded = planRepository.findAvailable(planId).orElseThrow();

        assertEquals(List.of("A", "B"), service.readFeatures(reloaded.getFeaturesJson()),
                "features_json must survive the Hibernate/DB binding unchanged");
    }

    // ------------------------------------------------------------------ create / update (API 22, 23)

    @Test
    void createPlanReturns201ShapeAndRoundTripsFeatures() {
        PlanWriteRequest request = new PlanWriteRequest("  New Plan  ", "new description", new BigDecimal("150000"),
                15, 50000, java.util.Arrays.asList("  Feature one  ", "", null, "Feature two"), null, null);

        PlanDetail detail = service.create(request);

        assertNotNull(detail.planId());
        assertEquals("New Plan", detail.planName());
        assertEquals("new description", detail.description());
        assertEquals(0, new BigDecimal("150000").compareTo(detail.price()));
        assertEquals("VND", detail.currency());
        assertEquals(15, detail.durationDays());
        assertEquals(50000, detail.aiTokenLimit());
        assertEquals(List.of("Feature one", "Feature two"), detail.features());
        assertTrue(detail.isActive(), "isActive defaults to true");
        assertEquals(0, detail.sortOrder(), "sortOrder defaults to 0");
        assertEquals(0L, detail.activeSubscribers());
        assertEquals(0L, detail.totalSubscribers());
        assertNotNull(detail.createdAt());
        assertNotNull(detail.updatedAt());

        em.flush();
        em.clear();
        SubscriptionPlan persisted = planRepository.findAvailable(detail.planId()).orElseThrow();
        assertEquals("New Plan", persisted.getPlanName());
        assertTrue(persisted.getIsActive());
        assertEquals(0, persisted.getSortOrder());
        assertNotNull(persisted.getCreatedAt());
        assertEquals(List.of("Feature one", "Feature two"), service.readFeatures(persisted.getFeaturesJson()));
    }

    @Test
    void createPlanRejectsDuplicateNameCaseInsensitive() {
        BaseException duplicate = assertThrows(BaseException.class, () -> service.create(new PlanWriteRequest(
                " plan a ", null, new BigDecimal("1000"), 30, 1000, null, true, 0)));

        assertEquals(ResponseCode.CONFLICT, duplicate.getResponseCode());
        assertEquals(409, duplicate.getResponseCode().getHttpStatus().value());
        assertEquals("PLAN_NAME_EXISTS", ((Map<?, ?>) duplicate.getData()).get("code"));
    }

    @Test
    void createPlanRejectsTooManyFeatures() {
        List<String> features = java.util.stream.IntStream.rangeClosed(1, 21)
                .mapToObj(i -> "Feature " + i).toList();

        BaseException invalid = assertThrows(BaseException.class, () -> service.create(new PlanWriteRequest(
                "Many features", null, new BigDecimal("1000"), 30, 1000, features, true, 0)));

        assertEquals(ResponseCode.VALIDATION_ERROR, invalid.getResponseCode());
        assertEquals(400, invalid.getResponseCode().getHttpStatus().value());
        Map<?, ?> data = (Map<?, ?>) invalid.getData();
        assertEquals("VALIDATION_FAILED", data.get("code"));
        List<?> errors = (List<?>) data.get("errors");
        assertEquals("features", ((Map<?, ?>) errors.get(0)).get("field"));
    }

    @Test
    void createPlanRejectsTooLongFeatureItems() {
        String tooLong = "x".repeat(201);

        BaseException invalid = assertThrows(BaseException.class, () -> service.create(new PlanWriteRequest(
                "Long feature", null, new BigDecimal("1000"), 30, 1000, List.of(tooLong), true, 0)));

        assertEquals(ResponseCode.VALIDATION_ERROR, invalid.getResponseCode());
        Map<?, ?> data = (Map<?, ?>) invalid.getData();
        assertEquals("VALIDATION_FAILED", data.get("code"));
        List<?> errors = (List<?>) data.get("errors");
        assertEquals("features", ((Map<?, ?>) errors.get(0)).get("field"));
    }

    @Test
    void updatePlanReplacesFieldsAndNeverTouchesSubscriptionSnapshot() {
        UserSubscription snapshot = subscriptionRepository.findAll().stream()
                .filter(s -> s.getPlan().getPlanId().equals(planA.getPlanId()))
                .filter(s -> "ACTIVE".equals(s.getStatus()))
                .findFirst().orElseThrow();
        Long subscriptionId = snapshot.getSubscriptionId();
        BigDecimal paidAmount = snapshot.getPaidAmount();
        Instant startDate = snapshot.getStartDate();
        em.clear();
        SubscriptionPlan before = planRepository.findAvailable(planA.getPlanId()).orElseThrow();
        Instant createdAt = before.getCreatedAt();
        Instant updatedAtBefore = before.getUpdatedAt();

        PlanDetail updated = service.update(planA.getPlanId(), new PlanWriteRequest(
                "Plan A Plus", "updated description", new BigDecimal("199000"), 60, 300000,
                List.of("  New feature  ", "Second feature"), false, 7));

        assertEquals(planA.getPlanId(), updated.planId());
        assertEquals("Plan A Plus", updated.planName());
        assertEquals("updated description", updated.description());
        assertEquals(0, new BigDecimal("199000").compareTo(updated.price()));
        assertEquals(60, updated.durationDays());
        assertEquals(300000, updated.aiTokenLimit());
        assertEquals(List.of("New feature", "Second feature"), updated.features());
        assertFalse(updated.isActive());
        assertEquals(7, updated.sortOrder());
        assertEquals("VND", updated.currency());
        assertEquals(createdAt, updated.createdAt(), "created_at is immutable on update");

        em.flush();
        em.clear();
        SubscriptionPlan persisted = planRepository.findAvailable(planA.getPlanId()).orElseThrow();
        assertEquals(0, new BigDecimal("199000").compareTo(persisted.getPrice()));
        assertTrue(persisted.getUpdatedAt().isAfter(updatedAtBefore), "updated_at must be refreshed on update");

        UserSubscription reloaded = subscriptionRepository.findById(subscriptionId).orElseThrow();
        assertEquals(0, paidAmount.compareTo(reloaded.getPaidAmount()),
                "paid_amount is a snapshot and must survive plan price edits");
        assertEquals("ACTIVE", reloaded.getStatus());
        assertEquals(planA.getPlanId(), reloaded.getPlan().getPlanId());
        assertEquals(startDate, reloaded.getStartDate());
    }

    @Test
    void updateSoftDeletedPlanReturns404() {
        BaseException missing = assertThrows(BaseException.class, () -> service.update(planD.getPlanId(),
                new PlanWriteRequest("Plan D delete", null, new BigDecimal("1000"), 30, 1000, null, true, 0)));

        assertEquals(ResponseCode.RESOURCE_NOT_FOUND, missing.getResponseCode());
        assertEquals("PLAN_NOT_FOUND", ((Map<?, ?>) missing.getData()).get("code"));
    }

    @Test
    void updateKeepsNameWhenUnchangedSelf() {
        PlanDetail updated = service.update(planA.getPlanId(), new PlanWriteRequest(
                "  plan a  ", planA.getDescription(), planA.getPrice(), 30, 200000,
                List.of("AI quizzes"), true, 1));

        assertEquals("Plan A", updated.planName(), "case-only self-rename keeps the stored casing");
    }

    @Test
    void createIgnoresSoftDeletedDuplicateName() {
        SubscriptionPlan beta = plan("Beta", true, 10, "[]");
        beta.setDeletedAt(Instant.now());
        planRepository.saveAndFlush(beta);
        em.clear();

        PlanDetail created = service.create(new PlanWriteRequest(
                " beta ", "fresh beta", new BigDecimal("50000"), 30, 1000, List.of("One"), true, 11));

        assertEquals("beta", created.planName());
        assertNotEquals(beta.getPlanId(), created.planId(), "soft-deleted plan must not be reused");
        em.flush();
        em.clear();
        assertTrue(planRepository.findAvailable(beta.getPlanId()).isEmpty());
        assertTrue(planRepository.findAvailable(created.planId()).isPresent());
    }

    // ------------------------------------------------------------------ status / reorder / delete (API 24, 25, 26)

    @Test
    void togglePlanStatusHidesPlanFromPublicListOnly() {
        StatusUpdateResponse response = service.setStatus(planA.getPlanId(), new StatusUpdateRequest(false));

        assertEquals(planA.getPlanId(), response.planId());
        assertFalse(response.isActive());

        em.flush();
        em.clear();

        assertTrue(service.publicList().stream().noneMatch(p -> "Plan A".equals(p.planName())),
                "a deactivated plan disappears from the purchase screen");

        PlanItem adminItem = service.list(null, null, 0, 20, "sortOrder,asc").getContent().stream()
                .filter(i -> planA.getPlanId().equals(i.planId()))
                .findFirst().orElseThrow();
        assertFalse(adminItem.isActive(), "the admin list still shows the plan with its new flag");
        assertTrue(planRepository.findAvailable(planA.getPlanId()).isPresent(), "deactivate is not a delete");

        assertTrue(service.setStatus(planA.getPlanId(), new StatusUpdateRequest(true)).isActive(),
                "toggling back re-publishes the plan");
    }

    @Test
    void reorderRequiresCompletePlanList() {
        assertValidationField(assertThrows(BaseException.class,
                () -> service.reorder(new ReorderRequest(List.of(planA.getPlanId(), planB.getPlanId())))), "orderedPlanIds");
        assertValidationField(assertThrows(BaseException.class,
                () -> service.reorder(new ReorderRequest(List.of(planA.getPlanId(), planB.getPlanId(),
                        planC.getPlanId(), planC.getPlanId())))), "orderedPlanIds");
        assertValidationField(assertThrows(BaseException.class,
                () -> service.reorder(new ReorderRequest(List.of(planA.getPlanId(), planB.getPlanId(),
                        planC.getPlanId(), 999_999L)))), "orderedPlanIds");
        assertValidationField(assertThrows(BaseException.class,
                () -> service.reorder(new ReorderRequest(List.of(planA.getPlanId(), planD.getPlanId(),
                        planB.getPlanId(), planC.getPlanId())))), "orderedPlanIds");

        List<PlanItem> reordered = service.reorder(new ReorderRequest(
                List.of(planC.getPlanId(), planB.getPlanId(), planA.getPlanId())));

        assertEquals(List.of("Plan C", "Plan B", "Plan A"), names(reordered));
        assertEquals(List.of(0, 1, 2), reordered.stream().map(PlanItem::sortOrder).toList());
        assertEquals(0L, reordered.get(0).activeSubscribers());
        assertEquals(1L, reordered.get(1).activeSubscribers());
        assertEquals(2L, reordered.get(2).activeSubscribers());

        em.flush();
        em.clear();
        assertEquals(0, planRepository.findAvailable(planC.getPlanId()).orElseThrow().getSortOrder());
        assertEquals(1, planRepository.findAvailable(planB.getPlanId()).orElseThrow().getSortOrder());
        assertEquals(2, planRepository.findAvailable(planA.getPlanId()).orElseThrow().getSortOrder());
        assertEquals(4, planRepository.findById(planD.getPlanId()).orElseThrow().getSortOrder(),
                "soft-deleted plans are outside the reorder set");

        assertEquals(List.of("Plan C", "Plan B", "Plan A"),
                names(service.list(null, null, 0, 20, "sortOrder,asc").getContent()));
        assertEquals(List.of("Plan B", "Plan A"), service.publicList().stream()
                .map(PublicPlanItem::planName).toList(), "public order follows the new sort_order");
    }

    @Test
    void reorderLeavesDbUntouchedWhenInvalid() {
        Map<Long, Integer> before = planRepository.findAll().stream()
                .collect(java.util.stream.Collectors.toMap(SubscriptionPlan::getPlanId, SubscriptionPlan::getSortOrder));

        assertThrows(BaseException.class, () -> service.reorder(new ReorderRequest(
                List.of(planA.getPlanId(), planB.getPlanId(), planC.getPlanId(), planA.getPlanId()))));

        em.flush();
        em.clear();
        for (SubscriptionPlan persisted : planRepository.findAll()) {
            assertEquals(before.get(persisted.getPlanId()), persisted.getSortOrder(),
                    "sort_order must not change on an invalid reorder (plan " + persisted.getPlanName() + ")");
        }
    }

    @Test
    void deletePlanBlockedByActiveSubscriber() {
        BaseException blocked = assertThrows(BaseException.class, () -> service.delete(planA.getPlanId()));
        assertEquals(ResponseCode.CONFLICT, blocked.getResponseCode());
        assertEquals(409, blocked.getResponseCode().getHttpStatus().value());
        assertEquals("PLAN_HAS_ACTIVE_SUBSCRIBERS", ((Map<?, ?>) blocked.getData()).get("code"));
        em.flush();
        em.clear();
        assertTrue(planRepository.findAvailable(planA.getPlanId()).isPresent(), "a blocked delete leaves the row untouched");

        // Conservative ruling: an ACTIVE row outside its paid window still blocks delete.
        SubscriptionPlan pastWindow = plan("Plan E", true, 5, "[]");
        subscription(account(User.ROLE_STUDENT), pastWindow,
                Instant.now().minus(90, ChronoUnit.DAYS), Instant.now().minus(60, ChronoUnit.DAYS), "ACTIVE");
        em.flush();
        em.clear();
        assertThrows(BaseException.class, () -> service.delete(pastWindow.getPlanId()));

        List<UserSubscription> planSubs = subscriptionRepository.findAll().stream()
                .filter(s -> s.getPlan().getPlanId().equals(planA.getPlanId())).toList();
        planSubs.forEach(s -> s.setStatus("EXPIRED"));
        subscriptionRepository.saveAll(planSubs);
        em.flush();
        em.clear();

        service.delete(planA.getPlanId());
        em.flush();
        em.clear();

        assertTrue(service.publicList().stream().noneMatch(p -> "Plan A".equals(p.planName())));
        BaseException gone = assertThrows(BaseException.class, () -> service.detail(planA.getPlanId()));
        assertEquals(ResponseCode.RESOURCE_NOT_FOUND, gone.getResponseCode());
        assertEquals("PLAN_NOT_FOUND", ((Map<?, ?>) gone.getData()).get("code"));
        assertNotNull(planRepository.findById(planA.getPlanId()).orElseThrow().getDeletedAt(),
                "soft delete keeps the row with deleted_at set");
        assertTrue(subscriptionRepository.findAll().stream()
                .anyMatch(s -> s.getPlan().getPlanId().equals(planA.getPlanId())), "subscriptions are preserved");
    }

    @Test
    void deleteUnknownOrAlreadyDeletedIs404() {
        BaseException unknown = assertThrows(BaseException.class, () -> service.delete(999_999L));
        assertEquals(ResponseCode.RESOURCE_NOT_FOUND, unknown.getResponseCode());
        assertEquals(404, unknown.getResponseCode().getHttpStatus().value());
        assertEquals("PLAN_NOT_FOUND", ((Map<?, ?>) unknown.getData()).get("code"));

        BaseException softDeleted = assertThrows(BaseException.class, () -> service.delete(planD.getPlanId()));
        assertEquals("PLAN_NOT_FOUND", ((Map<?, ?>) softDeleted.getData()).get("code"));

        service.delete(planC.getPlanId());
        BaseException twice = assertThrows(BaseException.class, () -> service.delete(planC.getPlanId()));
        assertEquals("PLAN_NOT_FOUND", ((Map<?, ?>) twice.getData()).get("code"));
    }

    // ------------------------------------------------------------------ HTTP layer (Task 6)

    @Test
    void adminRoutesShapeAndStatusCodes() throws Exception {
        PlanWriteRequest createRequest = new PlanWriteRequest("HTTP Plan", "http description",
                new BigDecimal("120000"), 30, 100000, List.of("One feature"), true, 5);

        String createdBody = mvc.perform(post("/api/v1/admin/subscription-plans")
                        .with(as(admin))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(createRequest)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.message").value("Plan created"))
                .andExpect(jsonPath("$.data.planId").isNumber())
                .andReturn().getResponse().getContentAsString();
        long planId = json.readTree(createdBody).path("data").path("planId").asLong();

        mvc.perform(get("/api/v1/admin/subscription-plans").with(as(admin)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.content").isNotEmpty());

        mvc.perform(get("/api/v1/admin/subscription-plans/" + planId).with(as(admin)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.planId").value(planId))
                .andExpect(jsonPath("$.data.planName").value("HTTP Plan"));

        PlanWriteRequest updateRequest = new PlanWriteRequest("HTTP Plan Renamed", "updated",
                new BigDecimal("130000"), 45, 150000, List.of("One feature", "Two"), true, 6);
        mvc.perform(put("/api/v1/admin/subscription-plans/" + planId)
                        .with(as(admin))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(updateRequest)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.planId").value(planId))
                .andExpect(jsonPath("$.data.planName").value("HTTP Plan Renamed"))
                .andExpect(jsonPath("$.data.sortOrder").value(6));

        mvc.perform(patch("/api/v1/admin/subscription-plans/" + planId + "/status")
                        .with(as(admin))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"isActive\":false}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.planId").value(planId))
                .andExpect(jsonPath("$.data.isActive").value(false));

        List<Long> reversedIds = new ArrayList<>(planRepository.findAllAvailable().stream()
                .map(SubscriptionPlan::getPlanId).toList());
        Collections.reverse(reversedIds);

        String reorderedBody = mvc.perform(put("/api/v1/admin/subscription-plans/reorder")
                        .with(as(admin))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(new ReorderRequest(reversedIds))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andReturn().getResponse().getContentAsString();
        JsonNode reordered = json.readTree(reorderedBody).path("data");
        assertEquals(reversedIds.size(), reordered.size());
        for (int i = 0; i < reversedIds.size(); i++) {
            assertEquals(reversedIds.get(i).longValue(), reordered.get(i).path("planId").asLong(),
                    "reorder response follows the requested order");
            assertEquals(i, reordered.get(i).path("sortOrder").asInt());
        }

        mvc.perform(delete("/api/v1/admin/subscription-plans/" + planId).with(as(admin)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.message").value("Plan deleted"))
                .andExpect(jsonPath("$.data").isEmpty());

        mvc.perform(get("/api/v1/admin/subscription-plans/" + planId).with(as(admin)))
                .andExpect(status().isNotFound());
    }

    @Test
    void detailNotFoundViaHttp() throws Exception {
        // Soft-deleted plan: the service raises BaseException, GlobalExceptionHandler renders the envelope.
        mvc.perform(get("/api/v1/admin/subscription-plans/" + planD.getPlanId()).with(as(admin)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.data.code").value("PLAN_NOT_FOUND"));

        mvc.perform(get("/api/v1/admin/subscription-plans/999999").with(as(admin)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.data.code").value("PLAN_NOT_FOUND"));
    }

    @Test
    void studentForbiddenOnAdminList() throws Exception {
        mvc.perform(get("/api/v1/admin/subscription-plans").with(as(subscriberOne)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.success").value(false));
    }

    @Test
    void publicListAllowsAnonymous() throws Exception {
        mvc.perform(get("/api/v1/subscription-plans"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.length()").value(2))
                .andExpect(jsonPath("$.data[0].planName").value("Plan A"))
                .andExpect(jsonPath("$.data[1].planName").value("Plan B"))
                .andExpect(jsonPath("$.data[0].isActive").value(true))
                .andExpect(jsonPath("$.data[0].currency").value("VND"));
    }

    @Test
    void reorderRouteDoesNotCollideWithId() throws Exception {
        List<Long> ids = planRepository.findAllAvailable().stream().map(SubscriptionPlan::getPlanId).toList();

        mvc.perform(put("/api/v1/admin/subscription-plans/reorder")
                        .with(as(admin))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(new ReorderRequest(ids))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.length()").value(ids.size()));

        // A non-existent numeric id still routes to PUT /{id} and yields the business 404 envelope.
        PlanWriteRequest valid = new PlanWriteRequest("Junk id plan", null, new BigDecimal("1000"),
                30, 1000, null, true, 0);
        mvc.perform(put("/api/v1/admin/subscription-plans/999999")
                        .with(as(admin))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(valid)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.data.code").value("PLAN_NOT_FOUND"));
    }

    @Test
    void createRejectsBlankPlanNameWithValidationEnvelope() throws Exception {
        PlanWriteRequest blank = new PlanWriteRequest("   ", null, new BigDecimal("1000"),
                30, 1000, null, true, 0);

        // Bean-validation failures render the spec §1.2 envelope (data.code + data.errors[]), the same
        // shape ContestRules.invalid produces for service-level validation — ApiValidationAdvice takes
        // precedence over GlobalExceptionHandler's legacy {field: message} map for these controllers.
        mvc.perform(post("/api/v1/admin/subscription-plans")
                        .with(as(admin))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(blank)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.data.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.data.errors[0].field").value("planName"))
                .andExpect(jsonPath("$.data.errors[0].message").isNotEmpty());
    }

    // ------------------------------------------------------------------ helpers

    private static void assertValidationField(BaseException ex, String field) {
        assertEquals(ResponseCode.VALIDATION_ERROR, ex.getResponseCode());
        assertEquals(400, ex.getResponseCode().getHttpStatus().value());
        Map<?, ?> data = (Map<?, ?>) ex.getData();
        assertEquals("VALIDATION_FAILED", data.get("code"));
        assertEquals(field, ((Map<?, ?>) ((List<?>) data.get("errors")).get(0)).get("field"));
    }

    private static List<String> names(List<PlanItem> items) {
        return items.stream().map(PlanItem::planName).toList();
    }

    private User account(String role) {
        User user = User.builder().email(UUID.randomUUID() + "@example.com").fullName(role + " user")
                .passwordHash("test-hash").roleName(role).build();
        return userRepository.save(user);
    }

    private SubscriptionPlan plan(String name, boolean active, int sortOrder, String featuresJson) {
        SubscriptionPlan plan = SubscriptionPlan.builder().planName(name).price(new BigDecimal("99000"))
                .durationDays(30).aiTokenLimit(200000).description(name + " description")
                .featuresJson(featuresJson).isActive(active).sortOrder(sortOrder).build();
        return planRepository.save(plan);
    }

    private void subscription(User user, SubscriptionPlan plan, Instant start, Instant end, String status) {
        subscriptionRepository.save(UserSubscription.builder().user(user).plan(plan).startDate(start).endDate(end)
                .status(status).paidAmount(plan.getPrice()).autoRenew(false).build());
    }
}
