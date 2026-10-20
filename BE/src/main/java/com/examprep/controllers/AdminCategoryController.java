package com.examprep.controllers;

import com.examprep.dto.*;
import com.examprep.security.UserPrincipal;
import com.examprep.services.CategoryService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/admin/categories")
@RequiredArgsConstructor
@PreAuthorize("hasRole('ADMIN')")
@Tag(name = "Admin Categories")
public class AdminCategoryController {
    private final CategoryService service;

    @GetMapping
    @Operation(summary = "CAT-01: Category administration tree")
    public ResponseEntity<ApiResponse<CategoryTreeResponse>> list(@RequestParam(defaultValue = "false") boolean includeDeleted) {
        return ResponseEntity.ok(ApiResponse.success(service.list(includeDeleted)));
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "CAT-02: Create category")
    public ResponseEntity<ApiResponse<CategoryAdminResponse>> create(@AuthenticationPrincipal UserPrincipal actor,
            @Valid @RequestBody CategoryRequests.Create request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(service.create(actor, request), ResponseCode.CREATED.getMessage()));
    }

    @PutMapping("/{id}")
    @Operation(summary = "CAT-03: Update category")
    public ResponseEntity<ApiResponse<CategoryAdminResponse>> update(@AuthenticationPrincipal UserPrincipal actor,
            @PathVariable Long id, @Valid @RequestBody CategoryRequests.Update request) {
        return ResponseEntity.ok(ApiResponse.success(service.update(actor, id, request)));
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "CAT-04: Soft delete an unused category")
    public ResponseEntity<ApiResponse<Void>> delete(@AuthenticationPrincipal UserPrincipal actor, @PathVariable Long id) {
        service.delete(actor, id);
        return ResponseEntity.ok(ApiResponse.success(null, "Category deleted successfully."));
    }

    @GetMapping("/tree")
    @Operation(summary = "CAT-05: Category TreeSelect options")
    public ResponseEntity<ApiResponse<List<CategorySelectResponse>>> tree() {
        return ResponseEntity.ok(ApiResponse.success(service.buildTree()));
    }
}
