package com.examprep.dto.student;

import jakarta.validation.constraints.Size;

public final class EnrollmentRequests {
    private EnrollmentRequests() {}

    /** EN-01 body: {@code {"discountCode": "SUMMER26"}}. */
    public record Checkout(@Size(max = 50) String discountCode) {}
}
