package com.examprep.services;

import com.examprep.dto.PageResponse;
import com.examprep.dto.student.PaymentResponses;
import java.util.List;

public interface PaymentService {
    List<PaymentResponses.Plan> plans(Long currentUserId);
    PaymentResponses.Current current(Long userId);
    PaymentResponses.AutoRenew autoRenew(Long userId, boolean enabled);
    PaymentResponses.Checkout checkout(Long userId, Long courseId, Long planId, String discountCode);
    PaymentResponses.Cancelled cancel(Long userId, String orderCode);
    PaymentResponses.PaymentState status(Long userId, String orderCode);
    PaymentResponses.Discount validateDiscount(Long userId, String code, Long courseId, Long planId);
    PageResponse<PaymentResponses.PaymentItem> history(Long userId, int page, int size);
    boolean webhook(com.fasterxml.jackson.databind.JsonNode payload);
}
