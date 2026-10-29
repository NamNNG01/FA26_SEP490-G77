package com.examprep.services;

import com.examprep.dto.student.EnrollmentResponses;
import com.examprep.dto.student.PaymentResponses;

public interface EnrollmentService {
    EnrollmentResponses.Checkout checkout(Long userId, Long courseId, String discountCode);
    EnrollmentResponses.Enrolled enrollFree(Long userId, Long courseId);
    EnrollmentResponses.State state(Long userId, Long courseId);
    EnrollmentResponses.Cancelled cancel(Long userId, Long courseId);
    PaymentResponses.Discount validateCourseDiscount(Long userId, String code, Long courseId);
}
