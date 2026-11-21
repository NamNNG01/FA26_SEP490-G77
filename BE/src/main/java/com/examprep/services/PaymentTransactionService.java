package com.examprep.services;

import com.examprep.dto.ResponseCode;
import com.examprep.entities.*;
import com.examprep.exceptions.BaseException;
import com.examprep.exceptions.ResourceConflictException;
import com.examprep.exceptions.ResourceNotFoundException;
import com.examprep.repositories.*;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.EntityManager;
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
    private final EntityManager entityManager;

    @Transactional
    public Payment createPending(Long userId, String orderCode, String type, Long refId, String title,
                                 BigDecimal amount, BigDecimal discountAmount, Discount discount, Instant expiresAt) {
        User user = users.findById(userId).orElseThrow(() -> new ResourceNotFoundException("User not found"));
        boolean reserved = false;
        if (discount != null) {
            Long discountId = discount.getDiscountId();
            // The usage limit is reserved while the link is payable, not when the webhook arrives;
            // otherwise two checkouts could both pass validation and overrun the cap.
            if ("CLAIM_REQUIRED".equalsIgnoreCase(discount.getAccessType())) {
                long unused = userDiscounts.countByUserUserIdAndDiscountDiscountIdAndIsUsedFalse(userId, discountId);
                long pendingCount = payments.countByUserUserIdAndDiscountDiscountIdAndStatus(userId, discountId, Payment.PENDING);
                if (unused <= pendingCount) {
                    throw new ResourceConflictException("Discount is already used or reserved by another checkout");
                }
            } else if (userDiscounts.existsByUserUserIdAndDiscountDiscountIdAndIsUsedTrue(userId, discountId)
                    || payments.existsByUserUserIdAndDiscountDiscountIdAndStatus(userId, discountId, Payment.PENDING)) {
                throw new ResourceConflictException("Discount is already used or reserved by another checkout");
            }
            if (discounts.reserveUsage(discountId, Instant.now()) == 0) {
                throw new BaseException(ResponseCode.INVALID_DISCOUNT_CODE, "Discount usage limit reached or discount is inactive/expired");
            }
            reserved = true;
        }
        Payment payment = Payment.builder().user(user).orderCode(orderCode).type(type).refId(refId).title(title)
                .amount(amount).discountAmount(discountAmount).discount(discount).discountReserved(reserved)
                .currency("VND").status(Payment.PENDING).expiresAt(expiresAt)
                .createdAt(Instant.now()).updatedAt(Instant.now()).build();
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
                releaseDiscount(payment);
                payment.setStatus(Payment.FAILED);
                payment.setUpdatedAt(Instant.now());
            }
        });
    }

    @Transactional
    public void expireDuePayments() {
        Instant now = Instant.now();
        for (Payment payment : payments.lockExpired(Payment.PENDING, now)) {
            expirePending(payment, now);
        }
    }

    @Transactional
    public void expireIfDue(String orderCode, boolean providerExpired) {
        Payment payment = payments.lockByOrderCode(orderCode)
                .orElseThrow(() -> new ResourceNotFoundException("Payment not found"));
        entityManager.refresh(payment);
        Instant now = Instant.now();
        if (Payment.PENDING.equals(payment.getStatus())
                && (providerExpired || (payment.getExpiresAt() != null && !payment.getExpiresAt().isAfter(now)))) {
            expirePending(payment, now);
        }
    }

    private void expirePending(Payment payment, Instant now) {
        releaseDiscount(payment);
        payment.setStatus(Payment.EXPIRED);
        payment.setCancelledAt(now);
        payment.setUpdatedAt(now);
    }

    @Transactional
    public void cancel(Long userId, String orderCode) {
        Payment locked = payments.lockByOrderCode(orderCode).orElseThrow(() -> new ResourceNotFoundException("Payment not found"));
        if (!locked.getUser().getUserId().equals(userId)) throw new ResourceNotFoundException("Payment not found");
        if (Payment.SUCCEEDED.equals(locked.getStatus())) throw new ResourceConflictException("Payment already succeeded");
        if (Payment.PENDING.equals(locked.getStatus())) {
            releaseDiscount(locked);
            locked.setStatus(Payment.CANCELLED);
            locked.setCancelledAt(Instant.now());
            locked.setUpdatedAt(Instant.now());
        }
    }

    @Transactional
    public boolean completeWebhook(JsonNode webhook) {
        JsonNode data = webhook.path("data");
        if (!"00".equals(webhook.path("code").asText())
                || !"00".equals(data.path("code").asText())
                || !data.path("orderCode").canConvertToLong()
                || !data.path("amount").isIntegralNumber()) return false;
        Payment locked = payments.lockByPayosOrderCode(data.path("orderCode").asLong()).orElse(null);
        if (locked == null || Payment.SUCCEEDED.equals(locked.getStatus())) return locked != null;
        // EXPIRED rows stay payable for a late webhook: the sweep only runs after the PayOS link
        // itself expired, so a verified "paid" callback means the student paid just in time.
        if ((!Payment.PENDING.equals(locked.getStatus()) && !Payment.EXPIRED.equals(locked.getStatus()))
                || data.path("amount").longValue() != locked.getAmount().longValueExact()) return false;
        Instant now = Instant.now();
        if (locked.getExpiresAt() != null && now.isAfter(locked.getExpiresAt())) {
            // The money was still captured: keep the purchase, but leave a trace for reconciliation.
            log.warn("Payment {} was confirmed after its checkout expiry; granting access", locked.getPaymentId());
        }
        String raw;
        try {
            raw = json.writeValueAsString(webhook);
        } catch (Exception ex) {
            throw new IllegalStateException("Could not store verified payment webhook", ex);
        }
        markPaid(locked, now, raw);
        return true;
    }

    /**
     * PY-04 fallback for a transfer PayOS captured but whose webhook never reached us (localhost, closed
     * firewall, lost delivery). Idempotent with the webhook, and an underpaid link is left for a human.
     */
    @Transactional
    public boolean reconcilePaid(String orderCode, long amountPaid, String raw) {
        Payment locked = payments.lockByOrderCode(orderCode).orElse(null);
        if (locked == null || Payment.SUCCEEDED.equals(locked.getStatus())) return false;
        if (!Payment.PENDING.equals(locked.getStatus()) && !Payment.EXPIRED.equals(locked.getStatus())) return false;
        if (amountPaid < locked.getAmount().longValueExact()) return false;
        markPaid(locked, Instant.now(), raw);
        return true;
    }

    /** The one place a payment becomes SUCCEEDED and access is granted (webhook and status reconciliation). */
    private void markPaid(Payment locked, Instant now, String raw) {
        locked.setStatus(Payment.SUCCEEDED);
        locked.setPaidAt(now);
        locked.setUpdatedAt(now);
        if (raw != null) locked.setPayosRaw(raw);
        if (Payment.COURSE.equals(locked.getType())) {
            grantCourse(locked, now);
        } else if (Payment.SUBSCRIPTION.equals(locked.getType())) {
            grantSubscription(locked, now);
        }
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
        subscriptions.findByUserUserIdAndStatus(user.getUserId(), "ACTIVE").forEach(old -> {
            old.setStatus("SUPERSEDED");
        });
        // PostgreSQL enforces one ACTIVE row per user, even if its end date has passed.
        // Flush the updates before the IDENTITY insert of the replacement subscription.
        subscriptions.flush();
        subscriptions.save(UserSubscription.builder().user(user).plan(plan).startDate(now)
                .endDate(now.plusSeconds(plan.getDurationDays().longValue() * 86400L)).status("ACTIVE")
                .paidAmount(payment.getAmount()).build());
        consumeDiscount(payment, now);
    }

    private void consumeDiscount(Payment payment, Instant now) {
        Discount discount = payment.getDiscount();
        if (discount == null) {
            return;
        }
        // Checkouts reserve their usage before the link is issued; only legacy or released rows consume here.
        if (!Boolean.TRUE.equals(payment.getDiscountReserved())) {
            discounts.incrementUsedCount(discount.getDiscountId());
            payment.setDiscountReserved(true);
        }
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

    private void releaseDiscount(Payment payment) {
        if (payment.getDiscount() != null && Boolean.TRUE.equals(payment.getDiscountReserved())) {
            discounts.releaseUsage(payment.getDiscount().getDiscountId());
            payment.setDiscountReserved(false);
        }
    }
}
