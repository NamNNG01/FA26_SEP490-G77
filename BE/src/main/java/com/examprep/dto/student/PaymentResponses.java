package com.examprep.dto.student;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

public final class PaymentResponses {
    private PaymentResponses() {}

    public record Plan(Long planId, String name, BigDecimal price, Integer durationDays, List<String> features,
                       boolean isRecommended, boolean isCurrent) {}
    public record Current(Long subscriptionId, Long planId, String planName, String status, BigDecimal price,
                          Instant startedAt, Instant expiresAt, long daysRemaining, boolean autoRenew) {}
    public record AutoRenew(Long subscriptionId, boolean autoRenew) {}
    /** PY-01: same payload as EN-01 (course) or SB-03 (plan); the other target pair is omitted. */
    public record Checkout(String orderCode, Long courseId, String courseTitle, Long planId, String planName,
                           BigDecimal originalPrice, BigDecimal discountAmount, BigDecimal totalPrice,
                           String paymentUrl, String qrCode, Instant expiresAt) {}
    public record PlanCheckout(String orderCode, Long planId, String planName, BigDecimal originalPrice,
                               BigDecimal discountAmount, BigDecimal totalPrice, String paymentUrl,
                               String qrCode, Instant expiresAt) {}
    public record PaymentState(String orderCode, String status, Instant paidAt, Instant expiresAt) {}
    public record PaymentItem(String orderCode, String type, Long refId, String title, BigDecimal amount,
                              String status, Instant createdAt, Instant paidAt) {}
    public record Discount(boolean valid, BigDecimal discountPercent, BigDecimal discountAmount,
                           BigDecimal finalPrice, Instant expiresAt, String reason) {}
    public record Cancelled(String orderCode, String status) {}
}
