package com.examprep.services;

import com.examprep.dto.ResponseCode;
import com.examprep.dto.student.EnrollmentResponses;
import com.examprep.dto.student.PaymentResponses;
import com.examprep.entities.*;
import com.examprep.exceptions.BaseException;
import com.examprep.exceptions.ForbiddenException;
import com.examprep.exceptions.ResourceConflictException;
import com.examprep.exceptions.ResourceNotFoundException;
import com.examprep.repositories.*;
import com.examprep.services.student.StudentProgressService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;

@Service
@RequiredArgsConstructor
public class EnrollmentServiceImpl implements EnrollmentService {
    private final CourseRepository courses;
    private final EnrollmentRepository enrollments;
    private final UserRepository users;
    private final PaymentService payments;
    private final StudentProgressService progressService;

    @Override
    public EnrollmentResponses.Checkout checkout(Long userId, Long courseId, String discountCode) {
        PaymentResponses.Checkout checkout = payments.checkout(userId, courseId, null, discountCode);
        return new EnrollmentResponses.Checkout(checkout.orderCode(), courseId, checkout.courseTitle(), checkout.originalPrice(),
                checkout.discountAmount(), checkout.totalPrice(), checkout.paymentUrl(), checkout.qrCode(), checkout.expiresAt());
    }

    @Override
    @Transactional
    public EnrollmentResponses.Enrolled enrollFree(Long userId, Long courseId) {
        Course course = courses.findForUpdate(courseId).filter(c -> Boolean.TRUE.equals(c.getIsPublished()))
                .orElseThrow(() -> new ResourceNotFoundException("Course not found"));
        if (course.getPrice() == null || course.getPrice().signum() != 0)
            throw new BaseException(ResponseCode.COURSE_NOT_FREE, "Course is not free; use EN-01 checkout");
        User user = users.findForUpdate(userId).orElseThrow(() -> new ResourceNotFoundException("User not found"));
        Enrollment enrollment = enrollments.findForUpdate(userId, courseId).orElse(null);
        if (enrollment == null) {
            enrollment = enrollments.save(Enrollment.builder().course(course).user(user).status(Enrollment.STATUS_ACTIVE)
                    .enrolledAt(Instant.now()).paidAmount(BigDecimal.ZERO).progress(0).build());
        } else if (!Enrollment.STATUS_ACTIVE.equals(enrollment.getStatus())) {
            enrollment.setStatus(Enrollment.STATUS_ACTIVE);
            enrollment.setEnrolledAt(Instant.now());
            enrollment.setCancelledAt(null);
            enrollment.setCancelReason(null);
        }
        return new EnrollmentResponses.Enrolled(courseId, enrollment.getStatus(), enrollment.getEnrolledAt());
    }

    @Override
    @Transactional
    public EnrollmentResponses.State state(Long userId, Long courseId) {
        if (!courses.existsById(courseId)) throw new ResourceNotFoundException("Course not found");
        Enrollment enrollment = enrollments.findByUser_UserIdAndCourse_CourseId(userId, courseId).orElse(null);
        if (enrollment == null) return new EnrollmentResponses.State(false, null, 0, null);
        boolean active = Enrollment.STATUS_ACTIVE.equals(enrollment.getStatus());
        int stored = enrollment.getProgress() == null ? 0 : Math.max(0, Math.min(100, enrollment.getProgress()));
        int progress = stored;
        if (active) {
            // EN-03 reports the same live completion LP-01 computes; persist it so no reader sees 0.
            int live = progressService.liveProgressPercent(userId, courseId);
            if (live >= 0) {
                progress = live;
                if (enrollment.getProgress() == null || enrollment.getProgress() != progress) {
                    enrollment.setProgress(progress);
                    enrollments.save(enrollment);
                }
            }
        }
        return new EnrollmentResponses.State(active, enrollment.getStatus(), progress, enrollment.getEnrolledAt());
    }

    @Override
    @Transactional
    public EnrollmentResponses.Cancelled cancel(Long userId, Long courseId) {
        Enrollment enrollment = enrollments.findForUpdate(userId, courseId)
                .orElseThrow(() -> new ResourceNotFoundException("Enrollment not found"));
        if (!Enrollment.STATUS_ACTIVE.equals(enrollment.getStatus())) throw new ResourceNotFoundException("Active enrollment not found");
        enrollment.setStatus(Enrollment.STATUS_CANCELLED);
        enrollment.setCancelledAt(Instant.now());
        enrollment.setCancelReason("Cancelled by student; paid course is non-refundable");
        return new EnrollmentResponses.Cancelled(courseId, Enrollment.STATUS_CANCELLED);
    }

    @Override
    @Transactional(readOnly = true)
    public PaymentResponses.Discount validateCourseDiscount(Long userId, String code, Long courseId) {
        return payments.validateDiscount(userId, code, courseId, null);
    }
}
