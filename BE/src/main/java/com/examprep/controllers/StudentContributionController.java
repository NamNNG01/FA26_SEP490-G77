package com.examprep.controllers;

import com.examprep.dto.ApiResponse;
import com.examprep.dto.PageResponse;
import com.examprep.dto.question.QuestionCreateRequest;
import com.examprep.dto.student.ContributionDetailDto;
import com.examprep.dto.student.ContributionItemDto;
import com.examprep.dto.student.TipContributionRequestDto;
import com.examprep.security.UserPrincipal;
import com.examprep.services.student.StudentContributionService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/student")
@RequiredArgsConstructor
@Tag(name = "Student Contributions", description = "Student question, document and tip contributions APIs")
public class StudentContributionController {

    private final StudentContributionService contributionService;

    @PostMapping("/contributions")
    @Operation(summary = "CQ-01: Student question contribution")
    public ResponseEntity<ApiResponse<Map<String, Object>>> createQuestionContribution(
            @Valid @RequestBody QuestionCreateRequest request,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        Map<String, Object> data = contributionService.createQuestionContribution(request, currentUser != null ? currentUser.getId() : null);
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(data, "Question contribution submitted successfully"));
    }

    @PostMapping("/contributions/documents")
    @Operation(summary = "CQ-02: Student document contribution")
    public ResponseEntity<ApiResponse<Map<String, Object>>> createDocumentContribution(
            @RequestParam("file") MultipartFile file,
            @RequestParam("courseId") Long courseId,
            @RequestParam("title") String title,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        Map<String, Object> data = contributionService.createDocumentContribution(file, courseId, title, currentUser != null ? currentUser.getId() : null);
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(data, "Document contribution submitted successfully"));
    }

    @GetMapping("/contributions")
    @Operation(summary = "CQ-03: List student contributions")
    public ResponseEntity<ApiResponse<PageResponse<ContributionItemDto>>> listContributions(
            @RequestParam(required = false) String type,
            @RequestParam(required = false) String status,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        Page<ContributionItemDto> p = contributionService.listContributions(type, status, page, size, currentUser != null ? currentUser.getId() : null);
        return ResponseEntity.ok(ApiResponse.success(PageResponse.of(p)));
    }

    @GetMapping("/contributions/{contributionId}")
    @Operation(summary = "CQ-04: Get contribution detail")
    public ResponseEntity<ApiResponse<ContributionDetailDto>> getContributionDetail(
            @PathVariable Long contributionId,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        ContributionDetailDto dto = contributionService.getContributionDetail(contributionId, currentUser != null ? currentUser.getId() : null);
        return ResponseEntity.ok(ApiResponse.success(dto));
    }

    @PutMapping("/contributions/{contributionId}/resubmit")
    @Operation(summary = "CQ-05: Resubmit rejected contribution")
    public ResponseEntity<ApiResponse<Map<String, Object>>> resubmitContribution(
            @PathVariable Long contributionId,
            @RequestBody(required = false) Object requestBody,
            @RequestParam(value = "file", required = false) MultipartFile file,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        Map<String, Object> data = contributionService.resubmitContribution(contributionId, requestBody, file, currentUser != null ? currentUser.getId() : null);
        return ResponseEntity.ok(ApiResponse.success(data, "Contribution resubmitted successfully"));
    }

    @PostMapping("/tips/contributions")
    @Operation(summary = "CQ-06: Student tip contribution")
    public ResponseEntity<ApiResponse<Map<String, Object>>> createTipContribution(
            @Valid @RequestBody TipContributionRequestDto request,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        Map<String, Object> data = contributionService.createTipContribution(request, currentUser != null ? currentUser.getId() : null);
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(data, "Tip contribution submitted successfully"));
    }
}
