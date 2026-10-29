package com.examprep.dto.student;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public final class PaymentRequests {
    private PaymentRequests() {}

    public record Checkout(Long courseId, Long planId, @Size(max = 50) String discountCode) {}
    public record SubscriptionCheckout(@NotNull Long planId, @Size(max = 50) String discountCode) {}
    public record AutoRenew(@NotNull Boolean autoRenew) {}
}
