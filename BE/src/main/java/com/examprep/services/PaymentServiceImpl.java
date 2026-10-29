package com.examprep.services;

import com.examprep.dto.PageResponse;
import com.examprep.dto.ResponseCode;
import com.examprep.dto.student.PaymentResponses;
import com.examprep.entities.*;
import com.examprep.exceptions.BadRequestException;
import com.examprep.exceptions.BaseException;
import com.examprep.exceptions.ResourceConflictException;
import com.examprep.exceptions.ResourceNotFoundException;
import com.examprep.repositories.*;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class PaymentServiceImpl implements PaymentService {
    private final PaymentRepository payments;
    private final SubscriptionPlanRepository plans;
    private final UserSubscriptionRepository subscriptions;
    private final CourseRepository courses;
    private final EnrollmentRepository enrollments;
    private final DiscountRepository discounts;
    private final UserDiscountRepository userDiscounts;
    private final PaymentTransactionService transactions;
    private final PayosClient payos;
    private final ObjectMapper json;

    @Override
    @Transactional(readOnly = true)
    public List<PaymentResponses.Plan> plans(Long currentUserId) {
        Long activePlan = currentUserId == null ? null : subscriptions.findActiveSubscriptionByUser(currentUserId, Instant.now())
                .map(s -> s.getPlan().getPlanId()).orElse(null);
        List<SubscriptionPlan> active = plans.findByIsActiveTrueAndDeletedAtIsNullOrderBySortOrderAscPlanIdAsc();
        // No is_recommended column exists: recommend the cheapest paid plan (the first upgrade step).
        BigDecimal cheapestPaid = active.stream()
                .map(SubscriptionPlan::getPrice)
                .filter(price -> price != null && price.signum() > 0)
                .min(BigDecimal::compareTo)
                .orElse(null);
        return active.stream().map(plan -> new PaymentResponses.Plan(plan.getPlanId(), plan.getPlanName(),
                plan.getPrice(), plan.getDurationDays(), parseFeatures(plan.getFeaturesJson()),
                plan.getPrice() != null && plan.getPrice().signum() > 0
                        && cheapestPaid != null && plan.getPrice().compareTo(cheapestPaid) == 0,
                Objects.equals(activePlan, plan.getPlanId()))).toList();
    }

    @Override
    @Transactional(readOnly = true)
    public PaymentResponses.Current current(Long userId) {
        return subscriptions.findActiveSubscriptionByUser(userId, Instant.now()).map(s -> {
            long days = Math.max(0, (long) Math.ceil((s.getEndDate().toEpochMilli() - Instant.now().toEpochMilli()) / 86400000.0));
            return new PaymentResponses.Current(s.getSubscriptionId(), s.getPlan().getPlanId(), s.getPlan().getPlanName(),
                    s.getStatus(), s.getPlan().getPrice(), s.getStartDate(), s.getEndDate(), days,
                    Boolean.TRUE.equals(s.getAutoRenew()));
        }).orElse(null);
    }

    @Override
    @Transactional
    public PaymentResponses.AutoRenew autoRenew(Long userId, boolean enabled) {
        UserSubscription subscription = subscriptions.lockActiveSubscriptionByUser(userId, Instant.now())
                .orElseThrow(() -> new ResourceNotFoundException("Active subscription not found"));
        subscription.setAutoRenew(enabled);
        return new PaymentResponses.AutoRenew(subscription.getSubscriptionId(), enabled);
    }

    @Override
    public PaymentResponses.Checkout checkout(Long userId, Long courseId, Long planId, String discountCode) {
        if ((courseId == null) == (planId == null)) {
            throw new BadRequestException(ResponseCode.VALIDATION_ERROR, "Exactly one of courseId or planId is required");
        }
        String type = courseId != null ? Payment.COURSE : Payment.SUBSCRIPTION;
        Long refId;
        String title;
        BigDecimal original;
        if (courseId != null) {
            Course course = courses.findDetail(courseId).filter(c -> Boolean.TRUE.equals(c.getIsPublished()))
                    .orElseThrow(() -> new ResourceNotFoundException("Course not found"));
            if (course.getPrice().signum() <= 0) throw new BaseException(ResponseCode.COURSE_NOT_FREE, "Free courses must use EN-02 enrollment");
            if (enrollments.existsByCourse_CourseIdAndUser_UserIdAndStatus(courseId, userId, Enrollment.STATUS_ACTIVE))
                throw new BaseException(ResponseCode.ALREADY_ENROLLED);
            refId = courseId; title = course.getTitle(); original = course.getPrice();
        } else {
            SubscriptionPlan plan = plans.findByPlanIdAndIsActiveTrueAndDeletedAtIsNull(planId)
                    .orElseThrow(() -> new ResourceNotFoundException("Subscription plan not found"));
            if (plan.getPrice().signum() <= 0) throw new ResourceConflictException("Free plan does not require checkout");
            refId = planId; title = plan.getPlanName(); original = plan.getPrice();
        }
        Discount discount = discountCode == null || discountCode.isBlank() ? null : validatedDiscount(userId, discountCode, type, original);
        BigDecimal discountAmount = discount == null ? BigDecimal.ZERO : calculateDiscount(discount, original);
        BigDecimal total = original.subtract(discountAmount).max(BigDecimal.ZERO).setScale(0, RoundingMode.HALF_UP);
        if (total.signum() <= 0) throw new ResourceConflictException("Payment amount must be greater than zero");
        // One live link per target: reuse the previous PENDING checkout when nothing changed, or
        // close it before creating a new one (spec 16/17 keep at most one payable link per order).
        Payment reusable = null;
        for (Payment previous : payments.findByUserUserIdAndTypeAndRefIdAndStatusOrderByPaymentIdDesc(
                userId, type, refId, Payment.PENDING)) {
            if (reusable == null && sameDiscount(previous.getDiscount(), discountCode)
                    && previous.getCheckoutUrl() != null && previous.getExpiresAt() != null
                    && previous.getExpiresAt().isAfter(Instant.now().plusSeconds(120))) {
                reusable = previous;
            } else if (!cancelPreviousPending(userId, previous)
                    && (previous.getExpiresAt() == null || previous.getExpiresAt().isAfter(Instant.now()))) {
                // Two live links would let the student pay twice.
                throw new BaseException(ResponseCode.PAYMENT_PROVIDER_ERROR,
                        "Payment provider could not cancel the previous pending payment");
            }
        }
        if (reusable != null) {
            BigDecimal pendingDiscount = reusable.getDiscountAmount() == null ? BigDecimal.ZERO : reusable.getDiscountAmount();
            return checkoutPayload(reusable.getOrderCode(), type, refId, reusable.getTitle(),
                    reusable.getAmount().add(pendingDiscount), pendingDiscount, reusable.getAmount(),
                    reusable.getCheckoutUrl(), reusable.getQrCodeUrl(), reusable.getExpiresAt());
        }
        Instant expiresAt = Instant.now().plus(30, ChronoUnit.MINUTES);
        // Epoch seconds alone collide when a student replaces a pending link for the same target
        // within one second, and order_code is unique.
        String orderCode = type + "-" + refId + "-USER" + userId + "-" + Instant.now().toEpochMilli()
                + "-" + UUID.randomUUID().toString().substring(0, 8);
        Payment payment = transactions.createPending(userId, orderCode, type, refId, title, total, discountAmount, discount, expiresAt);
        try {
            PayosClient.Link link = payos.create(payment.getPayosOrderCode(), total.intValueExact(), title + " " + orderCode);
            transactions.attachPayosLink(orderCode, link);
            return checkoutPayload(orderCode, type, refId, title, original, discountAmount, total,
                    link.checkoutUrl(), link.qrCode(), expiresAt);
        } catch (RuntimeException ex) {
            transactions.markCheckoutFailed(orderCode);
            log.warn("Payment checkout provider call failed for payment {}", payment.getPaymentId());
            throw new BaseException(ResponseCode.PAYMENT_PROVIDER_ERROR, "Payment provider could not create checkout");
        }
    }

    @Override
    public PaymentResponses.Cancelled cancel(Long userId, String orderCode) {
        Payment payment = payments.findByOrderCodeAndUserUserId(orderCode, userId)
                .orElseThrow(() -> new ResourceNotFoundException("Payment not found"));
        if (Payment.SUCCEEDED.equals(payment.getStatus())) throw new ResourceConflictException("Payment already succeeded");
        if (Payment.PENDING.equals(payment.getStatus())) {
            if (payment.getPayosOrderCode() != null) {
                try {
                    payos.cancel(payment.getPayosOrderCode());
                } catch (RuntimeException ex) {
                    log.warn("PayOS could not cancel payment {}", payment.getPaymentId());
                    throw new BaseException(ResponseCode.PAYMENT_PROVIDER_ERROR,
                            "Payment provider could not cancel the payment");
                }
            }
            transactions.cancel(userId, orderCode);
        }
        return new PaymentResponses.Cancelled(orderCode, Payment.CANCELLED);
    }

    @Override
    @Transactional(readOnly = true)
    public PaymentResponses.PaymentState status(Long userId, String orderCode) {
        Payment payment = payments.findByOrderCodeAndUserUserId(orderCode, userId)
                .orElseThrow(() -> new ResourceNotFoundException("Payment not found"));
        return new PaymentResponses.PaymentState(payment.getOrderCode(), payment.getStatus(), payment.getPaidAt(), payment.getExpiresAt());
    }

    @Override
    @Transactional(readOnly = true)
    public PaymentResponses.Discount validateDiscount(Long userId, String code, Long courseId, Long planId) {
        if ((courseId == null) == (planId == null)) throw new BadRequestException(ResponseCode.VALIDATION_ERROR, "Provide exactly one courseId or planId");
        BigDecimal price;
        String type;
        if (courseId != null) {
            Course course = courses.findDetail(courseId).filter(c -> Boolean.TRUE.equals(c.getIsPublished()))
                    .orElseThrow(() -> new ResourceNotFoundException("Course not found"));
            price = course.getPrice(); type = Payment.COURSE;
        } else {
            SubscriptionPlan plan = plans.findAvailable(planId).orElseThrow(() -> new ResourceNotFoundException("Subscription plan not found"));
            price = plan.getPrice(); type = Payment.SUBSCRIPTION;
        }
        try {
            Discount discount = validatedDiscount(userId, code, type, price);
            BigDecimal discountAmount = calculateDiscount(discount, price);
            BigDecimal percent = "PERCENT".equalsIgnoreCase(discount.getDiscountType()) ? discount.getPercent() : null;
            return new PaymentResponses.Discount(true, percent, discountAmount,
                    price.subtract(discountAmount).max(BigDecimal.ZERO).setScale(0, RoundingMode.HALF_UP),
                    discount.getExpiresAt(), null);
        } catch (BaseException ex) {
            return new PaymentResponses.Discount(false, null, BigDecimal.ZERO, price.setScale(0, RoundingMode.HALF_UP), null, ex.getMessage());
        }
    }

    @Override
    @Transactional(readOnly = true)
    public PageResponse<PaymentResponses.PaymentItem> history(Long userId, int page, int size) {
        if (page < 0 || size < 1 || size > 100) throw new BadRequestException("page must be >= 0 and size between 1 and 100");
        Page<Payment> result = payments.findByUserUserIdOrderByCreatedAtDesc(userId, PageRequest.of(page, size));
        return PageResponse.of(result, result.getContent().stream().map(p -> new PaymentResponses.PaymentItem(
                p.getOrderCode(), p.getType(), p.getRefId(), p.getTitle(), p.getAmount(), p.getStatus(), p.getCreatedAt(), p.getPaidAt())).toList());
    }

    @Override
    public boolean webhook(JsonNode payload) {
        if (!payos.verifyWebhook(payload)) return false;
        // Spec 17.3 rule 4: every authenticated webhook answers 200, whatever it says about our
        // records (unknown order, gateway failure code or amount mismatch), so PayOS stops retrying.
        if (!transactions.completeWebhook(payload))
            log.warn("Authenticated PayOS webhook had no effect on our records (code={}, known order=false or amount mismatch)",
                    payload == null ? null : payload.path("code").asText(null));
        return true;
    }

    private Discount validatedDiscount(Long userId, String code, String type, BigDecimal price) {
        Discount discount = discounts.findByCodeIgnoreCaseAndDeletedAtIsNull(code.strip())
                .orElseThrow(() -> new BaseException(ResponseCode.INVALID_DISCOUNT_CODE, "Discount code does not exist"));
        Instant now = Instant.now();
        if (!Boolean.TRUE.equals(discount.getIsActive()) || discount.getStartAt() != null && discount.getStartAt().isAfter(now)
                || discount.getExpiresAt() != null && discount.getExpiresAt().isBefore(now)
                || discount.getUsedCount() >= discount.getUsageLimit()
                || discount.getMinOrderAmount() != null && price.compareTo(discount.getMinOrderAmount()) < 0
                || !"ALL".equalsIgnoreCase(discount.getAppliesTo()) && !type.equalsIgnoreCase(discount.getAppliesTo())
                || userDiscounts.existsByUserUserIdAndDiscountDiscountIdAndIsUsedTrue(userId, discount.getDiscountId())) {
            throw new BaseException(ResponseCode.INVALID_DISCOUNT_CODE, "Discount is expired, used or does not apply");
        }
        return discount;
    }

    private BigDecimal calculateDiscount(Discount discount, BigDecimal price) {
        BigDecimal amount;
        if ("PERCENT".equalsIgnoreCase(discount.getDiscountType())) {
            BigDecimal percent = discount.getPercent() == null ? discount.getValue() : discount.getPercent();
            amount = price.multiply(percent).divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP);
        } else {
            amount = discount.getValue();
        }
        if (discount.getMaxDiscountAmount() != null) amount = amount.min(discount.getMaxDiscountAmount());
        return amount.max(BigDecimal.ZERO).min(price).setScale(0, RoundingMode.HALF_UP);
    }

    private List<String> parseFeatures(String raw) {
        if (raw == null || raw.isBlank()) return List.of();
        try { return json.readerForListOf(String.class).readValue(raw); }
        catch (Exception ex) { return List.of(); }
    }

    private static PaymentResponses.Checkout checkoutPayload(String orderCode, String type, Long refId, String title,
                                                             BigDecimal original, BigDecimal discountAmount,
                                                             BigDecimal total, String paymentUrl, String qrCode,
                                                             Instant expiresAt) {
        boolean course = Payment.COURSE.equals(type);
        return new PaymentResponses.Checkout(orderCode,
                course ? refId : null, course ? title : null,
                course ? null : refId, course ? null : title,
                original, discountAmount, total, paymentUrl, qrCode, expiresAt);
    }

    private static boolean sameDiscount(Discount existing, String requestedCode) {
        String existingCode = existing == null ? null : existing.getCode();
        if (requestedCode == null || requestedCode.isBlank()) {
            return existingCode == null;
        }
        return existingCode != null && existingCode.equalsIgnoreCase(requestedCode.strip());
    }

    /**
     * A previous channel is only abandoned locally after PayOS confirms the cancel; otherwise it
     * stays PENDING so a late payment still activates the purchase through the webhook.
     */
    private boolean cancelPreviousPending(Long userId, Payment payment) {
        if (payment.getPayosOrderCode() != null) {
            try {
                payos.cancel(payment.getPayosOrderCode());
            } catch (RuntimeException ex) {
                log.warn("PayOS could not cancel previous payment {}; leaving it payable", payment.getPaymentId());
                return false;
            }
        }
        try {
            transactions.cancel(userId, payment.getOrderCode());
        } catch (RuntimeException ex) {
            log.warn("Could not close previous payment {}", payment.getPaymentId());
        }
        return true;
    }
}
