package com.examprep.controllers;

import com.examprep.dto.ApiResponse;
import com.examprep.dto.question.*;
import com.examprep.entities.User;
import com.examprep.exceptions.ResourceNotFoundException;
import com.examprep.repositories.UserRepository;
import com.examprep.security.UserPrincipal;
import com.examprep.services.QuestionService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

@RestController
@RequestMapping("/api/v1/manager/questions")
@RequiredArgsConstructor
@Tag(name = "Question Bank", description = "Question Bank APIs for Course Managers and Admins")
public class QuestionController {

    private final QuestionService questionService;
    private final UserRepository userRepository;

    private User resolveUser(UserPrincipal principal) {
        return userRepository.findById(principal.getId())
                .orElseThrow(() -> new ResourceNotFoundException("User not found"));
    }

    @GetMapping
    @Operation(summary = "Q-01: List questions with filters and pagination")
    public ResponseEntity<ApiResponse<Page<QuestionListItemDto>>> getQuestions(
            @RequestParam(required = false) Long courseId,
            @RequestParam(required = false) Long moduleId,
            @RequestParam(required = false) Long groupId,
            @RequestParam(required = false) String questionType,
            @RequestParam(required = false) String difficulty,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String approvalStatus,
            @RequestParam(required = false) String creatorRole,
            @RequestParam(required = false) String source,
            @RequestParam(required = false) Long createdBy,
            @RequestParam(required = false) String skillTag,
            @RequestParam(required = false) String search,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @AuthenticationPrincipal UserPrincipal currentUser) {
        User user = resolveUser(currentUser);
        Pageable pageable = PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "updatedAt"));
        Page<QuestionListItemDto> result = questionService.getQuestions(
                courseId, moduleId, groupId, questionType, difficulty, status, approvalStatus,
                creatorRole, source, createdBy, skillTag, search, pageable, user);
        return ResponseEntity.ok(ApiResponse.success(result, "Questions retrieved successfully"));
    }

    @PostMapping
    @Operation(summary = "Q-02: Create single question")
    public ResponseEntity<ApiResponse<QuestionDetailDto>> createQuestion(
            @Valid @RequestBody QuestionCreateRequest request,
            @AuthenticationPrincipal UserPrincipal currentUser) {
        User user = resolveUser(currentUser);
        QuestionDetailDto created = questionService.createQuestion(request, user);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(created, "Question created successfully"));
    }

    @PostMapping("/batch")
    @Operation(summary = "Q-03: Batch create questions (1..50)")
    public ResponseEntity<ApiResponse<List<QuestionDetailDto>>> createQuestionsBatch(
            @RequestParam Long courseId,
            @RequestParam(required = false) Long moduleId,
            @Valid @RequestBody List<QuestionCreateRequest> requests,
            @AuthenticationPrincipal UserPrincipal currentUser) {
        User user = resolveUser(currentUser);
        List<QuestionDetailDto> created = questionService.createQuestionsBatch(courseId, moduleId, requests, user);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(created, "Questions batch created successfully"));
    }

    @GetMapping("/{id}")
    @Operation(summary = "Q-04: Get question detail")
    public ResponseEntity<ApiResponse<QuestionDetailDto>> getQuestionById(
            @PathVariable Long id,
            @AuthenticationPrincipal UserPrincipal currentUser) {
        User user = resolveUser(currentUser);
        QuestionDetailDto detail = questionService.getQuestionById(id, user);
        return ResponseEntity.ok(ApiResponse.success(detail, "Question retrieved successfully"));
    }

    @PutMapping("/{id}")
    @Operation(summary = "Q-05: Update question")
    public ResponseEntity<ApiResponse<QuestionDetailDto>> updateQuestion(
            @PathVariable Long id,
            @RequestBody QuestionUpdateRequest request,
            @AuthenticationPrincipal UserPrincipal currentUser) {
        User user = resolveUser(currentUser);
        QuestionDetailDto updated = questionService.updateQuestion(id, request, user);
        return ResponseEntity.ok(ApiResponse.success(updated, "Question updated successfully"));
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "Q-06: Soft delete question")
    public ResponseEntity<ApiResponse<Void>> deleteQuestion(
            @PathVariable Long id,
            @AuthenticationPrincipal UserPrincipal currentUser) {
        User user = resolveUser(currentUser);
        questionService.deleteQuestion(id, user);
        return ResponseEntity.ok(ApiResponse.success(null, "Question deleted successfully"));
    }

    @PostMapping("/{id}/duplicate")
    @Operation(summary = "Q-07: Duplicate question")
    public ResponseEntity<ApiResponse<QuestionDetailDto>> duplicateQuestion(
            @PathVariable Long id,
            @AuthenticationPrincipal UserPrincipal currentUser) {
        User user = resolveUser(currentUser);
        QuestionDetailDto duplicated = questionService.duplicateQuestion(id, user);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(duplicated, "Question duplicated successfully"));
    }

    @PatchMapping("/{id}/status")
    @Operation(summary = "Q-08: Change question status")
    public ResponseEntity<ApiResponse<QuestionDetailDto>> updateStatus(
            @PathVariable Long id,
            @Valid @RequestBody QuestionStatusRequest request,
            @AuthenticationPrincipal UserPrincipal currentUser) {
        User user = resolveUser(currentUser);
        QuestionDetailDto updated = questionService.updateQuestionStatus(id, request, user);
        return ResponseEntity.ok(ApiResponse.success(updated, "Question status updated successfully"));
    }

    @PostMapping("/ai/generate")
    @Operation(summary = "Generate questions using AI")
    public ResponseEntity<ApiResponse<AiGenerateResponse>> generateAiQuestions(
            @Valid @RequestBody AiGenerateRequest request,
            @AuthenticationPrincipal UserPrincipal currentUser) {
        User user = resolveUser(currentUser);
        AiGenerateResponse response = questionService.generateAiQuestions(request, user);
        return ResponseEntity.ok(ApiResponse.success(response, "AI questions generated successfully"));
    }

    @PostMapping("/ai/save")
    @Operation(summary = "Save AI generated questions")
    public ResponseEntity<ApiResponse<List<QuestionDetailDto>>> saveAiQuestions(
            @Valid @RequestBody AiSaveRequest request,
            @AuthenticationPrincipal UserPrincipal currentUser) {
        User user = resolveUser(currentUser);
        List<QuestionDetailDto> saved = questionService.saveAiQuestions(request, user);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(saved, "AI questions saved successfully"));
    }

    @GetMapping("/import/template")
    @Operation(summary = "Download Excel import template")
    public ResponseEntity<byte[]> downloadTemplate(
            @RequestParam Long courseId,
            @AuthenticationPrincipal UserPrincipal currentUser) {
        User user = resolveUser(currentUser);
        byte[] data = questionService.generateExcelTemplate(courseId, user);
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=question_import_template.xlsx")
                .contentType(MediaType.APPLICATION_OCTET_STREAM)
                .body(data);
    }

    @PostMapping("/import")
    @Operation(summary = "Import questions from Excel file")
    public ResponseEntity<ApiResponse<QuestionImportResult>> importQuestions(
            @RequestParam Long courseId,
            @RequestParam(defaultValue = "false") boolean dryRun,
            @RequestParam("file") MultipartFile file,
            @AuthenticationPrincipal UserPrincipal currentUser) {
        User user = resolveUser(currentUser);
        QuestionImportResult result = questionService.importExcel(courseId, file, dryRun, user);
        return ResponseEntity.ok(ApiResponse.success(result, "Import process completed"));
    }

    @GetMapping("/export")
    @Operation(summary = "Export questions to Excel file")
    public ResponseEntity<byte[]> exportQuestions(
            @RequestParam Long courseId,
            @RequestParam(required = false) String questionType,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String difficulty,
            @AuthenticationPrincipal UserPrincipal currentUser) {
        User user = resolveUser(currentUser);
        byte[] data = questionService.exportExcel(courseId, questionType, status, difficulty, user);
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=questions_export.xlsx")
                .contentType(MediaType.APPLICATION_OCTET_STREAM)
                .body(data);
    }
}
