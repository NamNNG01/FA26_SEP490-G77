package com.examprep.controllers;

import com.examprep.dto.ApiResponse;
import com.examprep.dto.PageResponse;
import com.examprep.dto.QuestionGroupCreateRequest;
import com.examprep.dto.QuestionGroupResponse;
import com.examprep.dto.QuestionGroupUpdateRequest;
import com.examprep.dto.ResponseCode;
import com.examprep.security.UserPrincipal;
import com.examprep.services.QuestionGroupService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/manager/question-groups")
@RequiredArgsConstructor
@PreAuthorize("hasAnyRole('COURSE_MANAGER', 'ADMIN')")
@Tag(name = "Question Groups", description = "Question group (shared passage) management for course managers")
public class QuestionGroupController {

    private final QuestionGroupService questionGroupService;

    @GetMapping
    @Operation(summary = "G-01: List question groups",
            description = "Returns paginated question groups filtered by course, module and title/passage search.")
    public ResponseEntity<ApiResponse<PageResponse<QuestionGroupResponse>>> getQuestionGroups(
            @AuthenticationPrincipal UserPrincipal currentUser,
            @RequestParam(required = false) Long courseId,
            @RequestParam(required = false) Long moduleId,
            @RequestParam(required = false) String search,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        PageResponse<QuestionGroupResponse> body = questionGroupService.getQuestionGroups(
                currentUser.getId(), currentUser.getRole(), courseId, moduleId, search, page, size);
        return ResponseEntity.ok(ApiResponse.success(body));
    }

    @PostMapping
    @Operation(summary = "G-02: Create question group",
            description = "Creates a question group (shared passage) for a course managed by the caller.")
    public ResponseEntity<ApiResponse<QuestionGroupResponse>> createQuestionGroup(
            @AuthenticationPrincipal UserPrincipal currentUser,
            @Valid @RequestBody QuestionGroupCreateRequest request) {
        QuestionGroupResponse body = questionGroupService.createQuestionGroup(
                currentUser.getId(), currentUser.getRole(), request);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(body, ResponseCode.CREATED.getMessage()));
    }

    @PutMapping("/{id}")
    @Operation(summary = "G-03: Update question group",
            description = "Updates the title and/or passage text of a question group.")
    public ResponseEntity<ApiResponse<QuestionGroupResponse>> updateQuestionGroup(
            @AuthenticationPrincipal UserPrincipal currentUser,
            @PathVariable Long id,
            @Valid @RequestBody QuestionGroupUpdateRequest request) {
        QuestionGroupResponse body = questionGroupService.updateQuestionGroup(
                currentUser.getId(), currentUser.getRole(), id, request);
        return ResponseEntity.ok(ApiResponse.success(body));
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "G-04: Delete question group",
            description = "Deletes a question group; its questions become standalone. Blocked when used by a published exam.")
    public ResponseEntity<ApiResponse<Void>> deleteQuestionGroup(
            @AuthenticationPrincipal UserPrincipal currentUser,
            @PathVariable Long id) {
        questionGroupService.deleteQuestionGroup(currentUser.getId(), currentUser.getRole(), id);
        return ResponseEntity.ok(ApiResponse.success(null, "Question group deleted successfully."));
    }
}
