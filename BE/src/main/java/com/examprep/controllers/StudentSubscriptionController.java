package com.examprep.controllers;

import com.examprep.dto.ApiResponse;
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

import java.util.List;

@RestController
@RequestMapping("/api/v1/student/subscription")
@RequiredArgsConstructor
@Tag(name = "Student Subscription")
public class StudentSubscriptionController {
    private final PaymentService service;

    @GetMapping("/plans")
    @Operation(summary = "SB-01: List subscription plans")
    public ResponseEntity<ApiResponse<List<PaymentResponses.Plan>>> plans(@AuthenticationPrincipal UserPrincipal user) {
        return ResponseEntity.ok(ApiResponse.success(service.plans(user == null ? null : user.getId())));
    }

    @GetMapping("/current")
    @Operation(summary = "SB-02: Get current subscription")
    public ResponseEntity<ApiResponse<PaymentResponses.Current>> current(@AuthenticationPrincipal UserPrincipal user) {
        return ResponseEntity.ok(ApiResponse.success(service.current(user.getId())));
    }

    @PostMapping("/checkout")
    @Operation(summary = "SB-03: Purchase a subscription plan")
    public ResponseEntity<ApiResponse<PaymentResponses.PlanCheckout>> checkout(@AuthenticationPrincipal UserPrincipal user,
            @Valid @RequestBody PaymentRequests.SubscriptionCheckout request) {
        PaymentResponses.Checkout checkout = service.checkout(user.getId(), null,
                request.planId(), request.discountCode());
        return ResponseEntity.status(201).body(ApiResponse.success(new PaymentResponses.PlanCheckout(
                checkout.orderCode(), checkout.planId(), checkout.planName(), checkout.originalPrice(),
                checkout.discountAmount(), checkout.totalPrice(), checkout.paymentUrl(), checkout.qrCode(),
                checkout.expiresAt()), "Checkout created"));
    }

    @PatchMapping("/auto-renew")
    @Operation(summary = "SB-04: Update auto-renew preference")
    public ResponseEntity<ApiResponse<PaymentResponses.AutoRenew>> autoRenew(@AuthenticationPrincipal UserPrincipal user,
            @Valid @RequestBody PaymentRequests.AutoRenew request) {
        return ResponseEntity.ok(ApiResponse.success(service.autoRenew(user.getId(), request.autoRenew())));
    }
}
