package com.examprep.services;

import com.examprep.dto.PageResponse;
import com.examprep.dto.student.PaymentResponses;
import java.util.List;
import java.util.Optional;

public interface PaymentService {
    List<PaymentResponses.Plan> plans(Long currentUserId);
    PaymentResponses.Current current(Long userId);
    PaymentResponses.Checkout checkout(Long userId, Long courseId, Long planId, String discountCode);
    PaymentResponses.Cancelled cancel(Long userId, String orderCode);
    PaymentResponses.PaymentState status(Long userId, String orderCode);
    Optional<PaymentResponses.PaymentState> latestCourseCheckout(Long userId, Long courseId);
    PaymentResponses.Discount validateDiscount(Long userId, String code, Long courseId, Long planId);
    PageResponse<PaymentResponses.PaymentItem> history(Long userId, int page, int size);
    boolean webhook(com.fasterxml.jackson.databind.JsonNode payload);
}
