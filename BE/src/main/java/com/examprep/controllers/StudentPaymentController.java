package com.examprep.controllers;

import com.examprep.dto.ApiResponse;
import com.examprep.dto.PageResponse;
import com.examprep.dto.student.PaymentRequests;
import com.examprep.dto.student.PaymentResponses;
import com.examprep.security.UserPrincipal;
import com.examprep.services.PaymentService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/student")
@RequiredArgsConstructor
@Tag(name = "Student Payments")
public class StudentPaymentController {
    private final PaymentService service;

    @PostMapping("/payments/checkout")
    @Operation(summary = "PY-01: Create payment checkout")
    public ResponseEntity<ApiResponse<PaymentResponses.Checkout>> checkout(@AuthenticationPrincipal UserPrincipal user,
            @Valid @RequestBody PaymentRequests.Checkout request) {
        return ResponseEntity.status(201).body(ApiResponse.success(service.checkout(user.getId(), request.courseId(),
                request.planId(), request.discountCode()), "Checkout created"));
    }

    @DeleteMapping("/payments/{orderCode}")
    @Operation(summary = "PY-02: Cancel payment request")
    public ResponseEntity<ApiResponse<PaymentResponses.Cancelled>> cancel(@AuthenticationPrincipal UserPrincipal user,
            @PathVariable String orderCode) {
        return ResponseEntity.ok(ApiResponse.success(service.cancel(user.getId(), orderCode)));
    }

    @GetMapping("/payments/{orderCode}/status")
    @Operation(summary = "PY-04: Get payment status")
    public ResponseEntity<ApiResponse<PaymentResponses.PaymentState>> status(@AuthenticationPrincipal UserPrincipal user,
            @PathVariable String orderCode) {
        return ResponseEntity.ok(ApiResponse.success(service.status(user.getId(), orderCode)));
    }

    @GetMapping("/discounts/validate")
    @Operation(summary = "PY-05: Validate discount")
    public ResponseEntity<ApiResponse<PaymentResponses.Discount>> discount(@AuthenticationPrincipal UserPrincipal user,
            @RequestParam String code, @RequestParam(required = false) Long courseId,
            @RequestParam(required = false) Long planId) {
        return ResponseEntity.ok(ApiResponse.success(service.validateDiscount(user.getId(), code, courseId, planId)));
    }

    @GetMapping("/payments/history")
    @Operation(summary = "PY-06: Payment history")
    public ResponseEntity<ApiResponse<PageResponse<PaymentResponses.PaymentItem>>> history(
            @AuthenticationPrincipal UserPrincipal user, @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size) {
        return ResponseEntity.ok(ApiResponse.success(service.history(user.getId(), page, size)));
    }
}
