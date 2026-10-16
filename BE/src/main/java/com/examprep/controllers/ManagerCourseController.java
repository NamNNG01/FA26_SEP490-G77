package com.examprep.controllers;

import com.examprep.dto.*;
import com.examprep.security.UserPrincipal;
import com.examprep.services.CourseService;
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
@RequestMapping("/api/v1/manager")
@RequiredArgsConstructor
@Tag(name = "Manager Courses", description = "Scoped course and module administration (C-04–C-14)")
public class ManagerCourseController {
    private final CourseService service;

    @GetMapping("/courses")
    @Operation(summary = "C-04: List managed courses, including drafts")
    public ResponseEntity<ApiResponse<PageResponse<CourseResponse>>> list(@AuthenticationPrincipal UserPrincipal user,
            @RequestParam(required = false) String search, @RequestParam(required = false) Long categoryId,
            @RequestParam(name = "isPublished", required = false) Boolean published,
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size,
            @RequestParam(defaultValue = "updatedAt,desc") String sort) {
        return ResponseEntity.ok(ApiResponse.success(service.list(user, search, categoryId, published, page, size, sort)));
    }

    @GetMapping("/courses/{id}")
    @Operation(summary = "C-05: Course detail with ordered modules and counts")
    public ResponseEntity<ApiResponse<CourseResponse>> detail(@AuthenticationPrincipal UserPrincipal user, @PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.success(service.detail(user, id)));
    }

    @PostMapping("/courses")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasRole('ADMIN')")
    @Operation(summary = "C-06: Create a draft course (Admin only)")
    public ResponseEntity<ApiResponse<CourseResponse>> create(@Valid @RequestBody CourseRequests.Create request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(service.create(request), ResponseCode.CREATED.getMessage()));
    }

    @PutMapping("/courses/{id}")
    @Operation(summary = "C-07: Update course; price and manager transfer are Admin only")
    public ResponseEntity<ApiResponse<CourseResponse>> update(@AuthenticationPrincipal UserPrincipal user, @PathVariable Long id,
            @Valid @RequestBody CourseRequests.Update request) {
        return ResponseEntity.ok(ApiResponse.success(service.update(user, id, request)));
    }

    @PatchMapping("/courses/{id}/publish")
    @PreAuthorize("hasRole('ADMIN')")
    @Operation(summary = "C-08: Publish or unpublish course (Admin only)")
    public ResponseEntity<ApiResponse<CourseResponse>> publish(@PathVariable Long id, @Valid @RequestBody CourseRequests.Publish request) {
        return ResponseEntity.ok(ApiResponse.success(service.publish(id, request)));
    }

    @DeleteMapping("/courses/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    @Operation(summary = "C-09: Delete course without dependent content (otherwise 409)")
    public ResponseEntity<ApiResponse<Void>> deleteCourse(@PathVariable Long id) {
        service.deleteCourse(id);
        return ResponseEntity.ok(ApiResponse.success(null, "Course deleted successfully."));
    }

    @GetMapping("/courses/{id}/modules")
    @Operation(summary = "C-10: List course modules")
    public ResponseEntity<ApiResponse<List<ModuleResponse>>> modules(@AuthenticationPrincipal UserPrincipal user, @PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.success(service.modules(user, id)));
    }

    @PostMapping("/courses/{id}/modules")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "C-11: Add module; omitted order appends")
    public ResponseEntity<ApiResponse<ModuleResponse>> createModule(@AuthenticationPrincipal UserPrincipal user, @PathVariable Long id,
            @Valid @RequestBody CourseRequests.CreateModule request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(service.createModule(user, id, request), ResponseCode.CREATED.getMessage()));
    }

    @PutMapping("/modules/{id}")
    @Operation(summary = "C-12: Update module")
    public ResponseEntity<ApiResponse<ModuleResponse>> updateModule(@AuthenticationPrincipal UserPrincipal user, @PathVariable Long id,
            @Valid @RequestBody CourseRequests.UpdateModule request) {
        return ResponseEntity.ok(ApiResponse.success(service.updateModule(user, id, request)));
    }

    @DeleteMapping("/modules/{id}")
    @Operation(summary = "C-13: Delete empty module; content or last published module returns 409")
    public ResponseEntity<ApiResponse<Void>> deleteModule(@AuthenticationPrincipal UserPrincipal user, @PathVariable Long id) {
        service.deleteModule(user, id);
        return ResponseEntity.ok(ApiResponse.success(null, "Module deleted successfully."));
    }

    @GetMapping("/courses/{id}/students")
    @Operation(summary = "C-14: List course students with stored progress")
    public ResponseEntity<ApiResponse<PageResponse<CourseStudentResponse>>> students(@AuthenticationPrincipal UserPrincipal user,
            @PathVariable Long id, @RequestParam(required = false) String search, @RequestParam(required = false) String status,
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size) {
        return ResponseEntity.ok(ApiResponse.success(service.students(user, id, search, status, page, size)));
    }
}
