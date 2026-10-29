package com.examprep.dto.student;

import java.math.BigDecimal;
import java.time.Instant;

public final class EnrollmentResponses {
    private EnrollmentResponses() {}

    public record Checkout(String orderCode, Long courseId, String courseTitle,
                           BigDecimal originalPrice, BigDecimal discountAmount, BigDecimal totalPrice,
                           String paymentUrl, String qrCode, Instant expiresAt) {}
    public record Enrolled(Long courseId, String status, Instant enrolledAt) {}
    public record State(boolean isEnrolled, String status, Integer progress, Instant enrolledAt) {}
    public record Cancelled(Long courseId, String status) {}
}
