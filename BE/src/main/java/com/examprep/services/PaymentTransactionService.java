package com.examprep.services;

import com.examprep.entities.*;
import com.examprep.exceptions.ResourceNotFoundException;
import com.examprep.repositories.*;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;

@Slf4j
@Service
@RequiredArgsConstructor
public class PaymentTransactionService {
    private final PaymentRepository payments;
    private final EnrollmentRepository enrollments;
    private final CourseRepository courses;
    private final SubscriptionPlanRepository plans;
    private final UserSubscriptionRepository subscriptions;
    private final UserRepository users;
    private final DiscountRepository discounts;
    private final UserDiscountRepository userDiscounts;
    private final ObjectMapper json;

    @Transactional
    public Payment createPending(Long userId, String orderCode, String type, Long refId, String title,
                                 BigDecimal amount, BigDecimal discountAmount, Discount discount, Instant expiresAt) {
        User user = users.findById(userId).orElseThrow(() -> new ResourceNotFoundException("User not found"));
        Payment payment = Payment.builder().user(user).orderCode(orderCode).type(type).refId(refId).title(title)
                .amount(amount).discountAmount(discountAmount).discount(discount).currency("VND")
                .status(Payment.PENDING).expiresAt(expiresAt).createdAt(Instant.now()).updatedAt(Instant.now()).build();
        payments.saveAndFlush(payment);
        payment.setPayosOrderCode(payment.getPaymentId());
        return payments.save(payment);
    }

    @Transactional
    public void attachPayosLink(String orderCode, PayosClient.Link link) {
        Payment payment = payments.lockByOrderCode(orderCode).orElseThrow(() -> new ResourceNotFoundException("Payment not found"));
        if (!Payment.PENDING.equals(payment.getStatus())) return;
        payment.setCheckoutUrl(link.checkoutUrl());
        payment.setQrCodeUrl(link.qrCode());
        payment.setPaymentLinkId(link.paymentLinkId());
        payment.setUpdatedAt(Instant.now());
    }

    @Transactional
    public void markCheckoutFailed(String orderCode) {
        payments.lockByOrderCode(orderCode).ifPresent(payment -> {
            if (Payment.PENDING.equals(payment.getStatus())) {
                payment.setStatus(Payment.FAILED);
                payment.setUpdatedAt(Instant.now());
            }
        });
    }

    @Transactional
    public void cancel(Long userId, String orderCode) {
        Payment payment = payments.findByOrderCodeAndUserUserId(orderCode, userId)
                .orElseThrow(() -> new ResourceNotFoundException("Payment not found"));
        Payment locked = payments.lockByOrderCode(orderCode).orElseThrow(() -> new ResourceNotFoundException("Payment not found"));
        if (Payment.SUCCEEDED.equals(locked.getStatus())) throw new com.examprep.exceptions.ResourceConflictException("Payment already succeeded");
        if (Payment.PENDING.equals(locked.getStatus())) {
            locked.setStatus(Payment.CANCELLED);
            locked.setCancelledAt(Instant.now());
            locked.setUpdatedAt(Instant.now());
        }
    }

    @Transactional
    public boolean completeWebhook(JsonNode webhook) {
        JsonNode data = webhook.path("data");
        if (!"00".equals(webhook.path("code").asText()) || !data.path("orderCode").canConvertToLong()) return false;
        Long numericCode = data.path("orderCode").asLong();
        Payment payment = payments.findByPayosOrderCode(numericCode).orElse(null);
        if (payment == null) return false;
        Payment locked = payments.lockByOrderCode(payment.getOrderCode()).orElse(null);
        if (locked == null || Payment.SUCCEEDED.equals(locked.getStatus())) return locked != null;
        if (!Payment.PENDING.equals(locked.getStatus()) || data.path("amount").asLong(-1) != locked.getAmount().longValueExact()) return false;
        Instant now = Instant.now();
        if (locked.getExpiresAt() != null && now.isAfter(locked.getExpiresAt())) {
            // The money was still captured: keep the purchase, but leave a trace for reconciliation.
            log.warn("Payment {} was confirmed after its checkout expiry; granting access", locked.getPaymentId());
        }
        locked.setStatus(Payment.SUCCEEDED);
        locked.setPaidAt(now);
        locked.setUpdatedAt(now);
        try {
            locked.setPayosRaw(json.writeValueAsString(webhook));
        } catch (Exception ex) {
            throw new IllegalStateException("Could not store verified payment webhook", ex);
        }
        if (Payment.COURSE.equals(locked.getType())) {
            grantCourse(locked, now);
        } else if (Payment.SUBSCRIPTION.equals(locked.getType())) {
            grantSubscription(locked, now);
        }
        return true;
    }

    private void grantCourse(Payment payment, Instant now) {
        Course course = courses.findForUpdate(payment.getRefId()).orElseThrow(() -> new ResourceNotFoundException("Course not found"));
        Enrollment existing = enrollments.findByUser_UserIdAndCourse_CourseId(payment.getUser().getUserId(), course.getCourseId()).orElse(null);
        if (existing == null) {
            enrollments.save(Enrollment.builder().course(course).user(payment.getUser()).status(Enrollment.STATUS_ACTIVE)
                    .enrolledAt(now).paidAmount(payment.getAmount()).progress(0).build());
        } else if (!Enrollment.STATUS_ACTIVE.equals(existing.getStatus())) {
            existing.setStatus(Enrollment.STATUS_ACTIVE);
            existing.setEnrolledAt(now);
            existing.setPaidAmount(payment.getAmount());
            existing.setCancelledAt(null);
            existing.setCancelReason(null);
        }
        consumeDiscount(payment, now);
    }

    private void grantSubscription(Payment payment, Instant now) {
        User user = users.findForUpdate(payment.getUser().getUserId()).orElseThrow(() -> new ResourceNotFoundException("User not found"));
        SubscriptionPlan plan = plans.findAvailable(payment.getRefId()).orElseThrow(() -> new ResourceNotFoundException("Subscription plan not found"));
        subscriptions.findCurrentOrFutureByUser(user.getUserId(), now).forEach(old -> {
            old.setStatus("SUPERSEDED");
            old.setAutoRenew(false);
        });
        subscriptions.save(UserSubscription.builder().user(user).plan(plan).startDate(now)
                .endDate(now.plusSeconds(plan.getDurationDays().longValue() * 86400L)).status("ACTIVE")
                .paidAmount(payment.getAmount()).autoRenew(false).build());
        consumeDiscount(payment, now);
    }

    private void consumeDiscount(Payment payment, Instant now) {
        Discount discount = payment.getDiscount();
        if (discount == null) {
            return;
        }
        discounts.incrementUsedCount(discount.getDiscountId());
        // Persist the one-per-student rule that validatedDiscount() checks before checkout.
        User user = payment.getUser();
        UserDiscount assignment = userDiscounts
                .findFirstByUserUserIdAndDiscountDiscountIdAndIsUsedFalse(user.getUserId(), discount.getDiscountId())
                .orElseGet(() -> UserDiscount.builder()
                        .user(user)
                        .discount(discount)
                        .sourceType("PAYMENT")
                        .sourceId(payment.getPaymentId())
                        .build());
        assignment.setIsUsed(true);
        assignment.setUsedAt(now);
        userDiscounts.save(assignment);
    }
}
