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
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Group C (admin subscription-plan config) — API 20/21 list + detail and the public plan list
 * feeding API 27. HTTP routing/auth assertions for these endpoints are added with the controller
 * in Task 6; at this stage the same contract is asserted through the service (the controller is a
 * thin envelope over it) so the service can be committed on its own.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class AdminSubscriptionPlanApiTest {

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

    // ------------------------------------------------------------------ helpers

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
