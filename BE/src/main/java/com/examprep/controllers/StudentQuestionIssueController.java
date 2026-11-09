package com.examprep.controllers;

import com.examprep.dto.ApiResponse;
import com.examprep.dto.PageResponse;
import com.examprep.dto.QuestionIssueDtos.*;
import com.examprep.security.UserPrincipal;
import com.examprep.services.QuestionIssueService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/student/question-issues")
@RequiredArgsConstructor
@Tag(name = "Student Question Issues", description = "Report a wrong question and follow the outcome")
public class StudentQuestionIssueController {
    private final QuestionIssueService service;

    @PostMapping
    @Operation(summary = "Report an issue with a question (joins the open ticket of that question)")
    public ResponseEntity<ApiResponse<ReportResult>> report(@AuthenticationPrincipal UserPrincipal me, @Valid @RequestBody ReportRequest body) {
        ReportResult result = service.report(me, body);
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(result, "Report submitted"));
    }

    @GetMapping
    @Operation(summary = "My question reports")
    public ResponseEntity<ApiResponse<PageResponse<ListItem>>> list(@AuthenticationPrincipal UserPrincipal me,
                                                                    @RequestParam(required = false) String status,
                                                                    @RequestParam(defaultValue = "0") int page,
                                                                    @RequestParam(defaultValue = "20") int size) {
        return ResponseEntity.ok(ApiResponse.success(service.studentList(me, status, page, size)));
    }

    @GetMapping("/{issueId}")
    @Operation(summary = "One of my question reports with its outcome")
    public ResponseEntity<ApiResponse<StudentDetail>> detail(@AuthenticationPrincipal UserPrincipal me, @PathVariable Long issueId) {
        return ResponseEntity.ok(ApiResponse.success(service.studentDetail(me, issueId)));
    }
}
