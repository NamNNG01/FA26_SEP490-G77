package com.examprep.controllers;

import com.examprep.dto.ApiResponse;
import com.examprep.dto.PageResponse;
import com.examprep.dto.student.StudentDiscountDtos;
import com.examprep.security.UserPrincipal;
import com.examprep.services.student.StudentDiscountService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/student/discounts")
@RequiredArgsConstructor
@Tag(name = "Student Discounts", description = "Student owned discounts and vouchers APIs")
public class StudentDiscountController {

    private final StudentDiscountService discountService;

    @GetMapping
    @Operation(summary = "Get list of student owned discounts")
    public ResponseEntity<ApiResponse<PageResponse<StudentDiscountDtos.StudentDiscountItemDto>>> listDiscounts(
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String source,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        Page<StudentDiscountDtos.StudentDiscountItemDto> p = discountService.listStudentDiscounts(currentUser.getId(), status, source, page, size);
        return ResponseEntity.ok(ApiResponse.success(PageResponse.of(p)));
    }

    @GetMapping("/{id}")
    @Operation(summary = "Get detail of a student owned discount")
    public ResponseEntity<ApiResponse<StudentDiscountDtos.StudentDiscountDetailDto>> getDiscountDetail(
            @PathVariable Long id,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        StudentDiscountDtos.StudentDiscountDetailDto dto = discountService.getStudentDiscountDetail(currentUser.getId(), id);
        return ResponseEntity.ok(ApiResponse.success(dto));
    }
}
