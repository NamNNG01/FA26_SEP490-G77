package com.examprep.controllers;

import com.examprep.dto.AdminPlanDtos.PublicPlanItem;
import com.examprep.dto.ApiResponse;
import com.examprep.services.admin.AdminSubscriptionPlanService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/** API 27: the purchase screen must work for anonymous visitors (permitAll GET in SecurityConfig). */
@RestController
@RequiredArgsConstructor
@Tag(name = "Subscription Plans (public)")
public class PublicSubscriptionPlanController {

    private final AdminSubscriptionPlanService service;

    @GetMapping("/api/v1/subscription-plans")
    @Operation(summary = "API 27: Public Subscription Plan List")
    public ResponseEntity<ApiResponse<List<PublicPlanItem>>> list() {
        return ResponseEntity.ok(ApiResponse.success(service.publicList()));
    }
}
