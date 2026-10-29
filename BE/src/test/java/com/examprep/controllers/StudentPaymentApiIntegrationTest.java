package com.examprep.controllers;

import com.examprep.entities.*;
import com.examprep.security.UserPrincipal;
import com.examprep.services.PaymentServiceImpl;
import com.examprep.services.PayosClient;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * End-to-end contract tests of EN-01 … EN-04 (enrollment), SB-01 … SB-04 (subscriptions),
 * PY-01 … PY-06 (payments) and the PY-03 PayOS webhook.
 *
 * <p>PayOS is mocked so the tests control the provider: no network call ever leaves the JVM while
 * every persistence, idempotency and ownership rule is exercised against H2.</p>
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class StudentPaymentApiIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired EntityManager em;
    @Autowired PaymentServiceImpl paymentService;
    @MockBean PayosClient payos;

    User manager, student, other, subscriber;
    Category category;
    Course paidCourse, freeCourse, unpublishedCourse, enrolledCourse;
    SubscriptionPlan freePlan, basicPlan, proPlan, inactivePlan;
    UserSubscription activeSubscription;
    Discount percentDiscount, expiredDiscount, subscriptionOnly, usedDiscount;

    @BeforeEach
    void fixtures() {
        when(payos.create(anyLong(), anyInt(), anyString())).thenAnswer(invocation ->
                new PayosClient.Link("https://pay.test/" + invocation.getArgument(0),
                        "qr-" + invocation.getArgument(0), "link-" + invocation.getArgument(0)));

        manager = account(User.ROLE_COURSE_MANAGER);
        student = account(User.ROLE_STUDENT);
        other = account(User.ROLE_STUDENT);
        subscriber = account(User.ROLE_STUDENT);

        category = Category.builder().name("Payments").slug(UUID.randomUUID().toString()).build();
        em.persist(category);
        paidCourse = course("Spring Boot", "500000", true);
        freeCourse = course("Java basics", "0", true);
        unpublishedCourse = course("Draft course", "100000", false);
        enrolledCourse = course("Already mine", "250000", true);
        em.persist(Enrollment.builder().course(enrolledCourse).user(student).enrolledAt(Instant.now())
                .status(Enrollment.STATUS_ACTIVE).build());

        freePlan = plan("Free", "0", 30, 1_000, 0);
        basicPlan = plan("Basic", "100000", 30, 200_000, 1);
        proPlan = plan("Pro", "300000", 90, 600_000, 2);
        inactivePlan = plan("Retired", "50000", 30, 100_000, 3);
        inactivePlan.setIsActive(false);
        em.persist(inactivePlan);

        activeSubscription = UserSubscription.builder().user(subscriber).plan(proPlan)
                .startDate(Instant.now().minus(10, ChronoUnit.DAYS))
                .endDate(Instant.now().plus(20, ChronoUnit.DAYS))
                .status("ACTIVE").paidAmount(proPlan.getPrice()).autoRenew(false).build();
        em.persist(activeSubscription);

        percentDiscount = discount("SAVE10", "PERCENT", "10", "ALL");
        expiredDiscount = discount("EXPIRED10", "PERCENT", "10", "ALL");
        expiredDiscount.setExpiresAt(Instant.now().minus(1, ChronoUnit.DAYS));
        subscriptionOnly = discount("PLANONLY", "FIXED", "20000", "SUBSCRIPTION");
        usedDiscount = discount("USED10", "PERCENT", "10", "ALL");
        em.persist(UserDiscount.builder().user(student).discount(usedDiscount).isUsed(true)
                .assignedAt(Instant.now()).sourceType("PAYMENT").build());
        em.flush();
    }

    // =================================================================================
    // EN-01
    // =================================================================================

    @Test
    void courseCheckoutCreatesOnePendingPaymentWithThePayosLink() throws Exception {
        JsonNode data = data(call(student, post(checkoutUrl(paidCourse)).contentType(MediaType.APPLICATION_JSON)
                .content("{}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.message").value("Checkout created")));

        assertEquals(paidCourse.getCourseId(), data.path("courseId").asLong());
        assertEquals("Spring Boot", data.path("courseTitle").asText());
        assertEquals(0, new BigDecimal("500000").compareTo(data.path("originalPrice").decimalValue()));
        assertEquals(0, BigDecimal.ZERO.compareTo(data.path("discountAmount").decimalValue()));
        assertEquals(0, new BigDecimal("500000").compareTo(data.path("totalPrice").decimalValue()));
        assertTrue(data.path("paymentUrl").asText().startsWith("https://pay.test/"));
        assertTrue(data.path("qrCode").asText().startsWith("qr-"));
        assertNotNull(data.path("expiresAt").textValue());
        assertFalse(data.has("planId"));
        assertFalse(data.has("planName"));

        Payment payment = payment(data.path("orderCode").asText());
        assertEquals(Payment.PENDING, payment.getStatus());
        assertEquals(paidCourse.getCourseId(), payment.getRefId());
        assertEquals(Payment.COURSE, payment.getType());
        assertEquals(0, new BigDecimal("500000").compareTo(payment.getAmount()));
        assertNotNull(payment.getPayosOrderCode());
        assertEquals("https://pay.test/" + payment.getPayosOrderCode(), payment.getCheckoutUrl());
        verify(payos, times(1)).create(payment.getPayosOrderCode(), 500000, "Spring Boot " + payment.getOrderCode());
    }

    @Test
    void courseCheckoutAppliesADiscountCode() throws Exception {
        JsonNode data = data(call(student, post(checkoutUrl(paidCourse)).contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("discountCode", "SAVE10"))))
                .andExpect(status().isCreated()));
        assertEquals(0, new BigDecimal("50000").compareTo(data.path("discountAmount").decimalValue()));
        assertEquals(0, new BigDecimal("450000").compareTo(data.path("totalPrice").decimalValue()));
        assertEquals(0, new BigDecimal("500000").compareTo(data.path("originalPrice").decimalValue()));

        Payment payment = payment(data.path("orderCode").asText());
        assertEquals(0, new BigDecimal("450000").compareTo(payment.getAmount()));
        assertEquals(percentDiscount.getDiscountId(), payment.getDiscount().getDiscountId());
    }

    @Test
    void courseCheckoutRefusesFreeUnpublishedEnrolledAndMissingCourses() throws Exception {
        call(student, post(checkoutUrl(freeCourse)).contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value("Free courses must use EN-02 enrollment"));
        call(student, post("/api/v1/student/courses/" + unpublishedCourse.getCourseId() + "/checkout")
                .contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isNotFound());
        call(student, post(checkoutUrl(enrolledCourse)).contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value("Already enrolled in this course"));
        call(student, post("/api/v1/student/courses/999999/checkout")
                .contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isNotFound());
        assertEquals(0, payments().size());
    }

    @Test
    void repeatedCheckoutReusesTheLiveLinkAndReplacesItWhenTheDiscountChanges() throws Exception {
        JsonNode first = data(call(student, post(checkoutUrl(paidCourse)).contentType(MediaType.APPLICATION_JSON)
                .content("{}")).andExpect(status().isCreated()));
        JsonNode repeated = data(call(student, post(checkoutUrl(paidCourse)).contentType(MediaType.APPLICATION_JSON)
                .content("{}")).andExpect(status().isCreated()));
        assertEquals(first.path("orderCode").asText(), repeated.path("orderCode").asText());
        assertEquals(first.path("paymentUrl").asText(), repeated.path("paymentUrl").asText());
        verify(payos, times(1)).create(anyLong(), anyInt(), anyString());
        assertEquals(1, payments().size());

        // A different discount cannot ride on the old amount: the old link is closed and replaced.
        JsonNode discounted = data(call(student, post(checkoutUrl(paidCourse)).contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("discountCode", "SAVE10"))))
                .andExpect(status().isCreated()));
        assertNotEquals(first.path("orderCode").asText(), discounted.path("orderCode").asText());
        assertEquals(0, new BigDecimal("450000").compareTo(discounted.path("totalPrice").decimalValue()));
        verify(payos, times(1)).cancel(payment(first.path("orderCode").asText()).getPayosOrderCode());
        assertEquals(Payment.CANCELLED, payment(first.path("orderCode").asText()).getStatus());
        assertEquals(2, payments().size());
    }

    @Test
    void checkoutFailsClosedWhenTheOldLinkCannotBeCancelled() throws Exception {
        JsonNode first = data(call(student, post(checkoutUrl(paidCourse)).contentType(MediaType.APPLICATION_JSON)
                .content("{}")).andExpect(status().isCreated()));
        doThrow(new IllegalStateException("provider down")).when(payos).cancel(anyLong());

        call(student, post(checkoutUrl(paidCourse)).contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("discountCode", "SAVE10"))))
                .andExpect(status().isBadGateway())
                .andExpect(jsonPath("$.message").value("Payment provider could not cancel the previous pending payment"));

        assertEquals(Payment.PENDING, payment(first.path("orderCode").asText()).getStatus(),
                "a link PayOS did not cancel must stay payable so a late payment is still honoured");
        assertEquals(1, payments().size());
        verify(payos, times(1)).create(anyLong(), anyInt(), anyString());
    }

    @Test
    void checkoutMarksThePaymentFailedWhenPayosCannotCreateTheLink() throws Exception {
        when(payos.create(anyLong(), anyInt(), anyString())).thenThrow(new IllegalStateException("PayOS down"));

        call(student, post(checkoutUrl(paidCourse)).contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isBadGateway())
                .andExpect(jsonPath("$.message").value("Payment provider could not create checkout"));

        List<Payment> rows = payments();
        assertEquals(1, rows.size());
        assertEquals(Payment.FAILED, rows.get(0).getStatus());
        assertNull(rows.get(0).getCheckoutUrl());
    }

    @Test
    void courseCheckoutIsStudentOnly() throws Exception {
        mvc.perform(post(checkoutUrl(paidCourse)).contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isUnauthorized());
        call(manager, post(checkoutUrl(paidCourse)).contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isForbidden());
    }

    // =================================================================================
    // EN-02
    // =================================================================================

    @Test
    void freeEnrollmentIsIdempotentAndReactivatesACancelledRow() throws Exception {
        JsonNode data = data(call(student, post("/api/v1/student/courses/" + freeCourse.getCourseId() + "/enroll"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.message").value("Enrolled")));
        assertEquals(freeCourse.getCourseId(), data.path("courseId").asLong());
        assertEquals(Enrollment.STATUS_ACTIVE, data.path("status").asText());
        assertNotNull(data.path("enrolledAt").textValue());

        call(student, post("/api/v1/student/courses/" + freeCourse.getCourseId() + "/enroll"))
                .andExpect(status().isCreated());
        assertEquals(1, enrollments(freeCourse, student).size());

        call(student, delete("/api/v1/student/my-courses/" + freeCourse.getCourseId()))
                .andExpect(status().isOk());
        call(student, post("/api/v1/student/courses/" + freeCourse.getCourseId() + "/enroll"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.status").value("ACTIVE"));
        assertEquals(1, enrollments(freeCourse, student).size(), "the same row is revived, not duplicated");
    }

    @Test
    void freeEnrollmentRefusesPaidUnpublishedAndUnknownCourses() throws Exception {
        call(student, post("/api/v1/student/courses/" + paidCourse.getCourseId() + "/enroll"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value("Course is not free; use EN-01 checkout"));
        call(student, post("/api/v1/student/courses/" + unpublishedCourse.getCourseId() + "/enroll"))
                .andExpect(status().isNotFound());
        call(student, post("/api/v1/student/courses/999999/enroll")).andExpect(status().isNotFound());
        assertEquals(0, enrollments(freeCourse, student).size());
    }

    @Test
    void freeEnrollmentIsStudentOnly() throws Exception {
        mvc.perform(post("/api/v1/student/courses/" + freeCourse.getCourseId() + "/enroll"))
                .andExpect(status().isUnauthorized());
        call(manager, post("/api/v1/student/courses/" + freeCourse.getCourseId() + "/enroll"))
                .andExpect(status().isForbidden());
    }

    // =================================================================================
    // EN-03
    // =================================================================================

    @Test
    void enrollmentStateDescribesNoEnrollmentActiveAndCancelledRows() throws Exception {
        call(student, get("/api/v1/student/courses/" + freeCourse.getCourseId() + "/enrollment"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.isEnrolled").value(false))
                .andExpect(jsonPath("$.data.progress").value(0))
                .andExpect(jsonPath("$.data.status").doesNotExist())
                .andExpect(jsonPath("$.data.enrolledAt").doesNotExist());

        Enrollment enrollment = Enrollment.builder().course(freeCourse).user(student).enrolledAt(Instant.now())
                .status(Enrollment.STATUS_ACTIVE).progress(150).build();
        em.persist(enrollment);
        em.flush();
        call(student, get("/api/v1/student/courses/" + freeCourse.getCourseId() + "/enrollment"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.isEnrolled").value(true))
                .andExpect(jsonPath("$.data.status").value("ACTIVE"))
                .andExpect(jsonPath("$.data.progress").value(100))
                .andExpect(jsonPath("$.data.enrolledAt").exists());

        enrollment.setStatus(Enrollment.STATUS_CANCELLED);
        em.flush();
        call(student, get("/api/v1/student/courses/" + freeCourse.getCourseId() + "/enrollment"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.isEnrolled").value(false))
                .andExpect(jsonPath("$.data.status").value("CANCELLED"));
    }

    @Test
    void enrollmentStateIs404ForAnUnknownCourse() throws Exception {
        call(student, get("/api/v1/student/courses/999999/enrollment")).andExpect(status().isNotFound());
    }

    // =================================================================================
    // EN-04
    // =================================================================================

    @Test
    void checkoutReservesTheDiscountUsageUntilTheCheckoutIsCancelled() throws Exception {
        String orderCode = checkoutOrderCode(paidCourse, "SAVE10");
        em.refresh(percentDiscount);
        assertEquals(1, percentDiscount.getUsedCount(), "a live checkout reserves one usage");

        // The same student cannot stack a second live checkout on the same code.
        call(student, post("/api/v1/student/subscription/checkout").contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("planId", basicPlan.getPlanId(), "discountCode", "SAVE10"))))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value("Discount is already used or reserved by another checkout"));

        call(student, delete("/api/v1/student/payments/" + orderCode)).andExpect(status().isOk());
        em.refresh(percentDiscount);
        assertEquals(0, percentDiscount.getUsedCount(), "cancelling releases the reservation");

        percentDiscount.setUsageLimit(1);
        em.flush();
        call(student, post("/api/v1/student/subscription/checkout").contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("planId", basicPlan.getPlanId(), "discountCode", "SAVE10"))))
                .andExpect(status().isCreated());
        em.refresh(percentDiscount);
        assertEquals(1, percentDiscount.getUsedCount());

        // The reservation, not just a completed payment, consumes the cap for everybody.
        call(other, post(checkoutUrl(paidCourse)).contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("discountCode", "SAVE10"))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Discount is expired, used or does not apply"));
    }

    @Test
    void enrollmentStateReportsAndPersistsTheLiveCompletionPercentage() throws Exception {
        call(student, post("/api/v1/student/courses/" + freeCourse.getCourseId() + "/enroll"))
                .andExpect(status().isCreated());
        Exam exam = Exam.builder().course(freeCourse).createdBy(manager).title("Free course quiz")
                .durationMinutes(30).isPractice(false).generationType("STATIC")
                .maxScore(new BigDecimal("10")).status("PUBLISHED").publishedAt(Instant.now()).build();
        em.persist(exam);
        em.persist(ExamAttempt.builder().exam(exam).user(student)
                .startTime(Instant.now().minus(20, ChronoUnit.MINUTES))
                .deadlineAt(Instant.now().plus(10, ChronoUnit.MINUTES))
                .status("COMPLETED").totalScore(new BigDecimal("8")).submitTime(Instant.now())
                .examSnapshot("{\"maxScore\":10}").build());
        em.flush();

        call(student, get("/api/v1/student/courses/" + freeCourse.getCourseId() + "/enrollment"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.progress").value(100));

        Enrollment row = enrollments(freeCourse, student).get(0);
        em.refresh(row);
        assertEquals(100, row.getProgress(), "EN-03 writes the LP-01 percentage back to the enrollment");
    }

    @Test
    void cancellingAnEnrollmentMarksItCancelled() throws Exception {
        call(student, post("/api/v1/student/courses/" + freeCourse.getCourseId() + "/enroll"))
                .andExpect(status().isCreated());

        JsonNode data = data(call(student, delete("/api/v1/student/my-courses/" + freeCourse.getCourseId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.message").value("Unenrolled")));
        assertEquals(freeCourse.getCourseId(), data.path("courseId").asLong());
        assertEquals(Enrollment.STATUS_CANCELLED, data.path("status").asText());

        Enrollment row = enrollments(freeCourse, student).get(0);
        assertEquals(Enrollment.STATUS_CANCELLED, row.getStatus());
        assertNotNull(row.getCancelledAt());
        assertNotNull(row.getCancelReason());

        call(student, delete("/api/v1/student/my-courses/" + freeCourse.getCourseId()))
                .andExpect(status().isNotFound());
    }

    @Test
    void cancellingChecksOwnershipAndExistence() throws Exception {
        call(student, post("/api/v1/student/courses/" + freeCourse.getCourseId() + "/enroll"))
                .andExpect(status().isCreated());
        call(other, delete("/api/v1/student/my-courses/" + freeCourse.getCourseId()))
                .andExpect(status().isNotFound());
        call(student, delete("/api/v1/student/my-courses/999999")).andExpect(status().isNotFound());
        assertEquals(Enrollment.STATUS_ACTIVE, enrollments(freeCourse, student).get(0).getStatus());
    }

    // =================================================================================
    // SB-01
    // =================================================================================

    @Test
    void plansArePublicSortedAndRecommendTheCheapestPaidPlan() throws Exception {
        JsonNode data = data(mvc.perform(get("/api/v1/student/subscription/plans"))
                .andExpect(status().isOk()));

        assertEquals(3, data.size(), "inactive plans are hidden");
        assertEquals("Free", data.get(0).path("name").asText());
        assertEquals("Basic", data.get(1).path("name").asText());
        assertEquals("Pro", data.get(2).path("name").asText());
        assertFalse(data.get(0).path("isRecommended").asBoolean());
        assertTrue(data.get(1).path("isRecommended").asBoolean());
        assertFalse(data.get(2).path("isRecommended").asBoolean());
        assertEquals(2, data.get(1).path("features").size());
        assertEquals("AI quizzes", data.get(1).path("features").get(0).asText());
        for (JsonNode plan : data) {
            assertFalse(plan.path("isCurrent").asBoolean());
        }
    }

    @Test
    void plansMarkTheActivePlanOfTheAuthenticatedStudent() throws Exception {
        JsonNode data = data(call(subscriber, get("/api/v1/student/subscription/plans"))
                .andExpect(status().isOk()));
        boolean marked = false;
        for (JsonNode plan : data) {
            if (plan.path("planId").asLong() == proPlan.getPlanId()) {
                marked = plan.path("isCurrent").asBoolean();
            } else {
                assertFalse(plan.path("isCurrent").asBoolean());
            }
        }
        assertTrue(marked);
    }

    // =================================================================================
    // SB-02
    // =================================================================================

    @Test
    void currentSubscriptionIsNullWithoutAnActiveRow() throws Exception {
        MvcResult result = call(student, get("/api/v1/student/subscription/current"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andReturn();
        assertTrue(data(result).isNull());
    }

    @Test
    void currentSubscriptionDescribesTheActivePlan() throws Exception {
        JsonNode data = data(call(subscriber, get("/api/v1/student/subscription/current"))
                .andExpect(status().isOk()));
        assertEquals(activeSubscription.getSubscriptionId(), data.path("subscriptionId").asLong());
        assertEquals(proPlan.getPlanId(), data.path("planId").asLong());
        assertEquals("Pro", data.path("planName").asText());
        assertEquals("ACTIVE", data.path("status").asText());
        assertEquals(0, proPlan.getPrice().compareTo(data.path("price").decimalValue()));
        assertEquals(20, data.path("daysRemaining").asLong());
        assertFalse(data.path("autoRenew").asBoolean());
        assertNotNull(data.path("startedAt").textValue());
        assertNotNull(data.path("expiresAt").textValue());
    }

    @Test
    void expiredSubscriptionIsNotCurrent() throws Exception {
        activeSubscription.setStartDate(Instant.now().minus(60, ChronoUnit.DAYS));
        activeSubscription.setEndDate(Instant.now().minus(1, ChronoUnit.DAYS));
        em.flush();
        MvcResult result = call(subscriber, get("/api/v1/student/subscription/current"))
                .andExpect(status().isOk()).andReturn();
        assertTrue(data(result).isNull());
    }

    // =================================================================================
    // SB-03
    // =================================================================================

    @Test
    void planCheckoutCreatesASubscriptionPayment() throws Exception {
        JsonNode data = data(call(student, post("/api/v1/student/subscription/checkout")
                .contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("planId", basicPlan.getPlanId()))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.message").value("Checkout created")));
        assertEquals(basicPlan.getPlanId(), data.path("planId").asLong());
        assertEquals("Basic", data.path("planName").asText());
        assertEquals(0, new BigDecimal("100000").compareTo(data.path("originalPrice").decimalValue()));
        assertEquals(0, new BigDecimal("100000").compareTo(data.path("totalPrice").decimalValue()));
        assertNotNull(data.path("orderCode").textValue());
        assertFalse(data.has("courseId"));
        assertFalse(data.has("courseTitle"));

        Payment payment = payment(data.path("orderCode").asText());
        assertEquals(Payment.SUBSCRIPTION, payment.getType());
        assertEquals(basicPlan.getPlanId(), payment.getRefId());
    }

    @Test
    void planCheckoutRefusesFreeInactiveAndUnknownPlans() throws Exception {
        call(student, post("/api/v1/student/subscription/checkout").contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("planId", freePlan.getPlanId()))))
                .andExpect(status().isConflict());
        call(student, post("/api/v1/student/subscription/checkout").contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("planId", inactivePlan.getPlanId()))))
                .andExpect(status().isNotFound());
        call(student, post("/api/v1/student/subscription/checkout").contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("planId", 999999))))
                .andExpect(status().isNotFound());
        call(student, post("/api/v1/student/subscription/checkout").contentType(MediaType.APPLICATION_JSON)
                .content("{}"))
                .andExpect(status().isBadRequest());
        assertEquals(0, payments().size());
    }

    @Test
    void planCheckoutRequiresAStudent() throws Exception {
        mvc.perform(post("/api/v1/student/subscription/checkout").contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("planId", basicPlan.getPlanId()))))
                .andExpect(status().isUnauthorized());
        call(manager, post("/api/v1/student/subscription/checkout").contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("planId", basicPlan.getPlanId()))))
                .andExpect(status().isForbidden());
    }

    // =================================================================================
    // SB-04
    // =================================================================================

    @Test
    void autoRenewTogglesTheActiveSubscription() throws Exception {
        call(subscriber, patch("/api/v1/student/subscription/auto-renew")
                .contentType(MediaType.APPLICATION_JSON).content("{\"autoRenew\":true}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.subscriptionId").value(activeSubscription.getSubscriptionId()))
                .andExpect(jsonPath("$.data.autoRenew").value(true));
        assertTrue(activeSubscription.getAutoRenew());

        call(subscriber, patch("/api/v1/student/subscription/auto-renew")
                .contentType(MediaType.APPLICATION_JSON).content("{\"autoRenew\":false}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.autoRenew").value(false));
        assertFalse(activeSubscription.getAutoRenew());
    }

    @Test
    void autoRenewNeedsAnActiveSubscriptionAndAValue() throws Exception {
        call(student, patch("/api/v1/student/subscription/auto-renew")
                .contentType(MediaType.APPLICATION_JSON).content("{\"autoRenew\":true}"))
                .andExpect(status().isNotFound());
        call(subscriber, patch("/api/v1/student/subscription/auto-renew")
                .contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isBadRequest());
    }

    // =================================================================================
    // PY-01
    // =================================================================================

    @Test
    void paymentCheckoutNeedsExactlyOneTarget() throws Exception {
        call(student, post("/api/v1/student/payments/checkout").contentType(MediaType.APPLICATION_JSON)
                .content("{}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Exactly one of courseId or planId is required"));
        call(student, post("/api/v1/student/payments/checkout").contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("courseId", paidCourse.getCourseId(),
                        "planId", basicPlan.getPlanId()))))
                .andExpect(status().isBadRequest());
        assertEquals(0, payments().size());
    }

    @Test
    void paymentCheckoutMirrorsTheCourseAndPlanShapes() throws Exception {
        JsonNode courseData = data(call(student, post("/api/v1/student/payments/checkout")
                .contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("courseId", paidCourse.getCourseId()))))
                .andExpect(status().isCreated()));
        assertEquals(paidCourse.getCourseId(), courseData.path("courseId").asLong());
        assertEquals("Spring Boot", courseData.path("courseTitle").asText());
        assertFalse(courseData.has("planId"));
        assertFalse(courseData.has("planName"));

        JsonNode planData = data(call(student, post("/api/v1/student/payments/checkout")
                .contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("planId", proPlan.getPlanId()))))
                .andExpect(status().isCreated()));
        assertEquals(proPlan.getPlanId(), planData.path("planId").asLong());
        assertEquals("Pro", planData.path("planName").asText());
        assertFalse(planData.has("courseId"));
        assertFalse(planData.has("courseTitle"));
    }

    // =================================================================================
    // PY-02
    // =================================================================================

    @Test
    void cancellingAPendingPaymentClosesThePayosLink() throws Exception {
        String orderCode = checkoutOrderCode(paidCourse, null);
        Payment pending = payment(orderCode);

        JsonNode data = data(call(student, delete("/api/v1/student/payments/" + orderCode))
                .andExpect(status().isOk()));
        assertEquals(orderCode, data.path("orderCode").asText());
        assertEquals(Payment.CANCELLED, data.path("status").asText());
        assertEquals(Payment.CANCELLED, payment(orderCode).getStatus());
        assertNotNull(payment(orderCode).getCancelledAt());
        verify(payos, times(1)).cancel(pending.getPayosOrderCode());

        call(student, delete("/api/v1/student/payments/" + orderCode))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("CANCELLED"));
        verify(payos, times(1)).cancel(anyLong());
    }

    @Test
    void cancelKeepsThePaymentPendingWhenPayosRefuses() throws Exception {
        String orderCode = checkoutOrderCode(paidCourse, null);
        doThrow(new IllegalStateException("provider down")).when(payos).cancel(anyLong());

        call(student, delete("/api/v1/student/payments/" + orderCode))
                .andExpect(status().isBadGateway())
                .andExpect(jsonPath("$.message").value("Payment provider could not cancel the payment"));
        assertEquals(Payment.PENDING, payment(orderCode).getStatus());
    }

    @Test
    void cancelRefusesASucceededPaymentAndChecksOwnership() throws Exception {
        String orderCode = checkoutOrderCode(paidCourse, null);
        payWebhook(orderCode, payment(orderCode).getAmount().longValue());
        assertEquals(Payment.SUCCEEDED, payment(orderCode).getStatus());

        call(student, delete("/api/v1/student/payments/" + orderCode))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value("Payment already succeeded"));
        call(other, delete("/api/v1/student/payments/" + orderCode)).andExpect(status().isNotFound());
        call(student, delete("/api/v1/student/payments/UNKNOWN")).andExpect(status().isNotFound());
    }

    // =================================================================================
    // PY-04
    // =================================================================================

    @Test
    void paymentStatusIsVisibleToTheOwnerOnly() throws Exception {
        String orderCode = checkoutOrderCode(paidCourse, null);
        JsonNode data = data(call(student, get("/api/v1/student/payments/" + orderCode + "/status"))
                .andExpect(status().isOk()));
        assertEquals(orderCode, data.path("orderCode").asText());
        assertEquals(Payment.PENDING, data.path("status").asText());
        assertFalse(data.has("paidAt"));
        assertNotNull(data.path("expiresAt").textValue());

        payWebhook(orderCode, payment(orderCode).getAmount().longValue());
        JsonNode paid = data(call(student, get("/api/v1/student/payments/" + orderCode + "/status"))
                .andExpect(status().isOk()));
        assertEquals(Payment.SUCCEEDED, paid.path("status").asText());
        assertNotNull(paid.path("paidAt").textValue());

        call(other, get("/api/v1/student/payments/" + orderCode + "/status")).andExpect(status().isNotFound());
        call(student, get("/api/v1/student/payments/UNKNOWN/status")).andExpect(status().isNotFound());
    }

    // =================================================================================
    // PY-05
    // =================================================================================

    @Test
    void discountValidationComputesThePriceForCoursesAndPlans() throws Exception {
        JsonNode course = data(call(student, get("/api/v1/student/discounts/validate")
                .param("code", "SAVE10").param("courseId", String.valueOf(paidCourse.getCourseId())))
                .andExpect(status().isOk()));
        assertTrue(course.path("valid").asBoolean());
        assertEquals(0, BigDecimal.TEN.compareTo(course.path("discountPercent").decimalValue()));
        assertEquals(0, new BigDecimal("50000").compareTo(course.path("discountAmount").decimalValue()));
        assertEquals(0, new BigDecimal("450000").compareTo(course.path("finalPrice").decimalValue()));

        JsonNode plan = data(call(student, get("/api/v1/student/discounts/validate")
                .param("code", "save10").param("planId", String.valueOf(basicPlan.getPlanId())))
                .andExpect(status().isOk()));
        assertTrue(plan.path("valid").asBoolean());
        assertEquals(0, new BigDecimal("90000").compareTo(plan.path("finalPrice").decimalValue()));

        JsonNode fixed = data(call(subscriber, get("/api/v1/student/discounts/validate")
                .param("code", "PLANONLY").param("planId", String.valueOf(basicPlan.getPlanId())))
                .andExpect(status().isOk()));
        assertTrue(fixed.path("valid").asBoolean());
        assertEquals(0, new BigDecimal("20000").compareTo(fixed.path("discountAmount").decimalValue()));
    }

    @Test
    void discountValidationReportsIneligibleCodesWithoutFailing() throws Exception {
        JsonNode expired = data(call(student, get("/api/v1/student/discounts/validate")
                .param("code", "EXPIRED10").param("courseId", String.valueOf(paidCourse.getCourseId())))
                .andExpect(status().isOk()));
        assertFalse(expired.path("valid").asBoolean());
        assertNotNull(expired.path("reason").asText());

        JsonNode wrongTarget = data(call(student, get("/api/v1/student/discounts/validate")
                .param("code", "PLANONLY").param("courseId", String.valueOf(paidCourse.getCourseId())))
                .andExpect(status().isOk()));
        assertFalse(wrongTarget.path("valid").asBoolean());

        JsonNode alreadyUsed = data(call(student, get("/api/v1/student/discounts/validate")
                .param("code", "USED10").param("courseId", String.valueOf(paidCourse.getCourseId())))
                .andExpect(status().isOk()));
        assertFalse(alreadyUsed.path("valid").asBoolean());

        JsonNode unknown = data(call(student, get("/api/v1/student/discounts/validate")
                .param("code", "NOPE").param("courseId", String.valueOf(paidCourse.getCourseId())))
                .andExpect(status().isOk()));
        assertFalse(unknown.path("valid").asBoolean());
    }

    @Test
    void discountValidationNeedsExactlyOneTargetAndAKnownOne() throws Exception {
        call(student, get("/api/v1/student/discounts/validate").param("code", "SAVE10"))
                .andExpect(status().isBadRequest());
        call(student, get("/api/v1/student/discounts/validate").param("code", "SAVE10")
                .param("courseId", String.valueOf(paidCourse.getCourseId()))
                .param("planId", String.valueOf(basicPlan.getPlanId())))
                .andExpect(status().isBadRequest());
        call(student, get("/api/v1/student/discounts/validate").param("code", "SAVE10")
                .param("courseId", "999999"))
                .andExpect(status().isNotFound());
        call(student, get("/api/v1/student/discounts/validate")
                .param("courseId", String.valueOf(paidCourse.getCourseId())))
                .andExpect(status().isBadRequest());
    }

    // =================================================================================
    // PY-06
    // =================================================================================

    @Test
    void historyIsNewestFirstPagedAndOwnerScoped() throws Exception {
        String firstOrder = checkoutOrderCode(paidCourse, null);
        String secondOrder = checkoutOrderCode(basicPlan, null);
        Payment first = payment(firstOrder);
        Payment second = payment(secondOrder);
        em.createQuery("update Payment p set p.createdAt = :createdAt where p.paymentId = :id")
                .setParameter("createdAt", Instant.now().minus(1, ChronoUnit.HOURS))
                .setParameter("id", first.getPaymentId()).executeUpdate();
        em.flush();
        em.clear();

        JsonNode data = data(call(student, get("/api/v1/student/payments/history")
                .param("page", "0").param("size", "1")).andExpect(status().isOk()));
        assertEquals(1, data.path("content").size());
        assertEquals(secondOrder, data.path("content").get(0).path("orderCode").asText());
        assertEquals(2, data.path("totalElements").asInt());
        assertEquals(2, data.path("totalPages").asInt());
        assertTrue(data.path("first").asBoolean());
        assertFalse(data.path("last").asBoolean());

        JsonNode secondPage = data(call(student, get("/api/v1/student/payments/history")
                .param("page", "1").param("size", "1")).andExpect(status().isOk()));
        assertEquals(firstOrder, secondPage.path("content").get(0).path("orderCode").asText());
        assertTrue(secondPage.path("last").asBoolean());

        JsonNode otherHistory = data(call(other, get("/api/v1/student/payments/history"))
                .andExpect(status().isOk()));
        assertEquals(0, otherHistory.path("totalElements").asInt());
    }

    @Test
    void historyValidatesPagingAndRequiresAuthentication() throws Exception {
        call(student, get("/api/v1/student/payments/history").param("page", "-1"))
                .andExpect(status().isBadRequest());
        call(student, get("/api/v1/student/payments/history").param("size", "0"))
                .andExpect(status().isBadRequest());
        call(student, get("/api/v1/student/payments/history").param("size", "101"))
                .andExpect(status().isBadRequest());
        mvc.perform(get("/api/v1/student/payments/history")).andExpect(status().isUnauthorized());
    }

    // =================================================================================
    // PY-03 webhook
    // =================================================================================

    @Test
    void webhookRejectsAnInvalidSignature() throws Exception {
        String orderCode = checkoutOrderCode(paidCourse, null);
        when(payos.verifyWebhook(any())).thenReturn(false);

        mvc.perform(post("/api/v1/webhooks/payos").contentType(MediaType.APPLICATION_JSON)
                        .content(webhookBody("00", payment(orderCode).getPayosOrderCode(),
                                payment(orderCode).getAmount().longValue())))
                .andExpect(status().isUnauthorized());
        assertEquals(Payment.PENDING, payment(orderCode).getStatus());
    }

    @Test
    void aValidWebhookGrantsCourseAccessExactlyOnce() throws Exception {
        when(payos.verifyWebhook(any())).thenReturn(true);
        String orderCode = checkoutOrderCode(paidCourse, "SAVE10");
        Payment pending = payment(orderCode);

        JsonNode ack = body(mvc.perform(post("/api/v1/webhooks/payos").contentType(MediaType.APPLICATION_JSON)
                        .content(webhookBody("00", pending.getPayosOrderCode(), pending.getAmount().longValue())))
                .andExpect(status().isOk()));
        assertTrue(ack.path("success").asBoolean());

        Payment paid = payment(orderCode);
        assertEquals(Payment.SUCCEEDED, paid.getStatus());
        assertNotNull(paid.getPaidAt());
        assertNotNull(paid.getPayosRaw());
        List<Enrollment> rows = enrollments(paidCourse, student);
        assertEquals(1, rows.size());
        assertEquals(Enrollment.STATUS_ACTIVE, rows.get(0).getStatus());
        assertEquals(0, new BigDecimal("450000").compareTo(rows.get(0).getPaidAmount()));

        // The discount is consumed exactly once.
        em.refresh(percentDiscount);
        assertEquals(1, percentDiscount.getUsedCount());
        assertEquals(1L, em.createQuery("select count(ud) from UserDiscount ud where ud.user = :u "
                        + "and ud.discount = :d and ud.isUsed = true", Long.class)
                .setParameter("u", student).setParameter("d", percentDiscount).getSingleResult());

        // A retried callback is accepted and changes nothing.
        mvc.perform(post("/api/v1/webhooks/payos").contentType(MediaType.APPLICATION_JSON)
                        .content(webhookBody("00", pending.getPayosOrderCode(), pending.getAmount().longValue())))
                .andExpect(status().isOk());
        assertEquals(1, payments().size());
        assertEquals(1, enrollments(paidCourse, student).size());
        em.refresh(percentDiscount);
        assertEquals(1, percentDiscount.getUsedCount());
    }

    @Test
    void webhookGrantsAnExpiredCheckoutBecauseTheMoneyWasCaptured() throws Exception {
        String orderCode = checkoutOrderCode(paidCourse, null);
        Payment pending = payment(orderCode);
        pending.setExpiresAt(Instant.now().minus(5, ChronoUnit.MINUTES));
        em.flush();

        payWebhook(orderCode, pending.getAmount().longValue());
        assertEquals(Payment.SUCCEEDED, payment(orderCode).getStatus());
        assertEquals(1, enrollments(paidCourse, student).size());
    }

    @Test
    void theReservationSweepReturnsTheDiscountAndALateWebhookStillGrantsAccess() throws Exception {
        String orderCode = checkoutOrderCode(paidCourse, "SAVE10");
        Payment pending = payment(orderCode);
        em.refresh(percentDiscount);
        assertEquals(1, percentDiscount.getUsedCount()); // reserved while the link is payable
        pending.setExpiresAt(Instant.now().minus(5, ChronoUnit.MINUTES));
        em.flush();

        paymentService.expireUnpaidReservations();

        assertEquals(Payment.EXPIRED, payment(orderCode).getStatus());
        em.refresh(percentDiscount);
        assertEquals(0, percentDiscount.getUsedCount()); // the abandoned checkout returned its usage

        // The PayOS link had expired, so a verified "paid" callback means the student paid in time.
        payWebhook(orderCode, pending.getAmount().longValue());
        assertEquals(Payment.SUCCEEDED, payment(orderCode).getStatus());
        assertEquals(1, enrollments(paidCourse, student).size());
        em.refresh(percentDiscount);
        assertEquals(1, percentDiscount.getUsedCount()); // consumed exactly once by the late capture
    }

    @Test
    void webhookAcceptsButIgnoresUnknownOrdersWrongAmountsAndFailedCodes() throws Exception {
        when(payos.verifyWebhook(any())).thenReturn(true);
        String orderCode = checkoutOrderCode(paidCourse, null);
        Payment pending = payment(orderCode);

        mvc.perform(post("/api/v1/webhooks/payos").contentType(MediaType.APPLICATION_JSON)
                        .content(webhookBody("00", 999999L, 500000L)))
                .andExpect(status().isOk());
        mvc.perform(post("/api/v1/webhooks/payos").contentType(MediaType.APPLICATION_JSON)
                        .content(webhookBody("00", pending.getPayosOrderCode(), 1L)))
                .andExpect(status().isOk());
        mvc.perform(post("/api/v1/webhooks/payos").contentType(MediaType.APPLICATION_JSON)
                        .content(webhookBody("01", pending.getPayosOrderCode(), pending.getAmount().longValue())))
                .andExpect(status().isOk());

        assertEquals(Payment.PENDING, payment(orderCode).getStatus());
        assertEquals(0, enrollments(paidCourse, student).size());
    }

    @Test
    void aSubscriptionWebhookSupersedesTheOldPlan() throws Exception {
        JsonNode checkout = data(call(subscriber, post("/api/v1/student/subscription/checkout")
                .contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("planId", basicPlan.getPlanId()))))
                .andExpect(status().isCreated()));
        Payment pending = payment(checkout.path("orderCode").asText());

        payWebhook(pending.getOrderCode(), pending.getAmount().longValue());
        assertEquals(Payment.SUCCEEDED, payment(pending.getOrderCode()).getStatus());
        em.refresh(activeSubscription);
        assertEquals("SUPERSEDED", activeSubscription.getStatus());
        assertFalse(activeSubscription.getAutoRenew());

        List<UserSubscription> rows = em.createQuery(
                        "select s from UserSubscription s where s.user = :u order by s.subscriptionId",
                        UserSubscription.class)
                .setParameter("u", subscriber).getResultList();
        assertEquals(2, rows.size());
        UserSubscription fresh = rows.get(1);
        assertEquals("ACTIVE", fresh.getStatus());
        assertEquals(basicPlan.getPlanId(), fresh.getPlan().getPlanId());
        assertEquals(0, basicPlan.getPrice().compareTo(fresh.getPaidAmount()));
        long days = ChronoUnit.DAYS.between(fresh.getStartDate(), fresh.getEndDate());
        assertEquals(30, days);
    }

    // =================================================================================
    // helpers
    // =================================================================================

    private ResultActions call(User actor, MockHttpServletRequestBuilder request) throws Exception {
        em.flush();
        return mvc.perform(request.with(user(UserPrincipal.create(actor))));
    }

    private JsonNode body(MvcResult result) throws Exception {
        return json.readTree(result.getResponse().getContentAsString());
    }

    private JsonNode body(ResultActions actions) throws Exception {
        return body(actions.andReturn());
    }

    private JsonNode data(MvcResult result) throws Exception {
        return body(result).path("data");
    }

    private JsonNode data(ResultActions actions) throws Exception {
        return data(actions.andReturn());
    }

    private String checkoutOrderCode(Course course, String discountCode) throws Exception {
        JsonNode data = data(call(student, post(checkoutUrl(course)).contentType(MediaType.APPLICATION_JSON)
                .content(discountCode == null ? "{}" : json.writeValueAsString(Map.of("discountCode", discountCode))))
                .andExpect(status().isCreated()));
        return data.path("orderCode").asText();
    }

    private String checkoutOrderCode(SubscriptionPlan plan, String discountCode) throws Exception {
        JsonNode data = data(call(student, post("/api/v1/student/subscription/checkout")
                .contentType(MediaType.APPLICATION_JSON)
                .content(discountCode == null
                        ? json.writeValueAsString(Map.of("planId", plan.getPlanId()))
                        : json.writeValueAsString(Map.of("planId", plan.getPlanId(), "discountCode", discountCode))))
                .andExpect(status().isCreated()));
        return data.path("orderCode").asText();
    }

    private String checkoutUrl(Course course) {
        return "/api/v1/student/courses/" + course.getCourseId() + "/checkout";
    }

    private String webhookBody(String code, long payosOrderCode, long amount) throws Exception {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("orderCode", payosOrderCode);
        data.put("amount", amount);
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("code", code);
        payload.put("data", data);
        return json.writeValueAsString(payload);
    }

    private void payWebhook(String orderCode, long amount) throws Exception {
        when(payos.verifyWebhook(any())).thenReturn(true);
        Payment pending = payment(orderCode);
        mvc.perform(post("/api/v1/webhooks/payos").contentType(MediaType.APPLICATION_JSON)
                        .content(webhookBody("00", pending.getPayosOrderCode(), amount)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true));
    }

    private Payment payment(String orderCode) {
        Payment payment = em.createQuery("select p from Payment p where p.orderCode = :code", Payment.class)
                .setParameter("code", orderCode).getSingleResult();
        assertNotNull(payment, "payment " + orderCode + " was not created");
        return payment;
    }

    private List<Payment> payments() {
        return em.createQuery("select p from Payment p order by p.paymentId", Payment.class).getResultList();
    }

    private List<Enrollment> enrollments(Course course, User user) {
        return em.createQuery("select e from Enrollment e where e.course = :c and e.user = :u", Enrollment.class)
                .setParameter("c", course).setParameter("u", user).getResultList();
    }

    private User account(String role) {
        User user = User.builder().email(UUID.randomUUID() + "@example.com").fullName(role)
                .passwordHash("test").roleName(role).build();
        em.persist(user);
        return user;
    }

    private Course course(String title, String price, boolean published) {
        Course course = Course.builder().categoryId(category.getCategoryId()).category(category).manager(manager)
                .title(title).slug(UUID.randomUUID().toString()).price(new BigDecimal(price))
                .isPublished(published).build();
        em.persist(course);
        return course;
    }

    private SubscriptionPlan plan(String name, String price, int days, int tokens, int sortOrder) {
        SubscriptionPlan plan = SubscriptionPlan.builder().planName(name).price(new BigDecimal(price))
                .durationDays(days).aiTokenLimit(tokens).featuresJson("[\"AI quizzes\",\"Offline notes\"]")
                .isActive(true).sortOrder(sortOrder).build();
        em.persist(plan);
        return plan;
    }

    private Discount discount(String code, String type, String value, String appliesTo) {
        boolean percent = "PERCENT".equals(type);
        Discount discount = Discount.builder().code(code).name(code).discountType(type)
                .value(percent ? null : new BigDecimal(value))
                .percent(percent ? new BigDecimal(value) : null)
                .usageLimit(10).usedCount(0).isActive(true).appliesTo(appliesTo).build();
        em.persist(discount);
        return discount;
    }
}
