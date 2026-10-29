package com.examprep.controllers;

import com.examprep.dto.AdminDiscountDtos.*;
import com.examprep.dto.ApiResponse;
import com.examprep.dto.PageResponse;
import com.examprep.services.admin.AdminDiscountService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/admin/discounts")
@RequiredArgsConstructor
@PreAuthorize("hasRole('ADMIN')")
@Tag(name = "Admin Discounts")
public class AdminDiscountController {

    private final AdminDiscountService service;

    @GetMapping
    @Operation(summary = "API 13: Admin Discount List")
    public ResponseEntity<ApiResponse<PageResponse<DiscountItem>>> list(
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) String discountType,
            @RequestParam(required = false) Boolean isActive,
            @RequestParam(required = false) String validity,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(defaultValue = "createdAt,desc") String sort) {
        return ResponseEntity.ok(ApiResponse.success(PageResponse.of(service.list(keyword, discountType, isActive, validity, page, size, sort))));
    }

    @GetMapping("/{id}")
    @Operation(summary = "API 14: Admin Discount Detail")
    public ResponseEntity<ApiResponse<DiscountDetail>> detail(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.success(service.detail(id)));
    }

    @PostMapping
    @Operation(summary = "API 15: Create Discount")
    public ResponseEntity<ApiResponse<DiscountDetail>> create(@Valid @RequestBody DiscountWriteRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(service.create(request), "Discount created"));
    }

    @PutMapping("/{id}")
    @Operation(summary = "API 16: Update Discount")
    public ResponseEntity<ApiResponse<DiscountDetail>> update(@PathVariable Long id, @Valid @RequestBody DiscountWriteRequest request) {
        return ResponseEntity.ok(ApiResponse.success(service.update(id, request)));
    }

    @PatchMapping("/{id}/status")
    @Operation(summary = "API 17: Toggle Discount Status")
    public ResponseEntity<ApiResponse<StatusUpdateResponse>> updateStatus(@PathVariable Long id, @Valid @RequestBody StatusUpdateRequest request) {
        return ResponseEntity.ok(ApiResponse.success(service.updateStatus(id, request)));
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "API 18: Soft Delete Discount")
    public ResponseEntity<ApiResponse<Void>> delete(@PathVariable Long id) {
        service.delete(id);
        return ResponseEntity.ok(ApiResponse.success(null, "Discount deleted"));
    }

    @GetMapping("/{id}/assignments")
    @Operation(summary = "API 19: Discount Assignments List")
    public ResponseEntity<ApiResponse<PageResponse<AssignmentItem>>> assignments(
            @PathVariable Long id,
            @RequestParam(required = false) Boolean isUsed,
            @RequestParam(required = false) String keyword,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return ResponseEntity.ok(ApiResponse.success(PageResponse.of(service.assignments(id, isUsed, keyword, page, size))));
    }
}
