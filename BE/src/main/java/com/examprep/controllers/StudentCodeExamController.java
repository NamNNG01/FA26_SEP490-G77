package com.examprep.controllers;

import com.examprep.dto.ApiResponse;
import com.examprep.dto.PageResponse;
import com.examprep.dto.student.CodeExamRequests;
import com.examprep.dto.student.CodeExamResponses;
import com.examprep.security.UserPrincipal;
import com.examprep.services.StudentCodeExamService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/v1/student/code-exams")
@RequiredArgsConstructor
@Tag(name = "Student Code Exams", description = "CD-03 … CD-07: coding tests judged by the self-hosted Judge0 sandbox")
public class StudentCodeExamController {
    private final StudentCodeExamService service;

    @GetMapping("/{examId}/questions")
    @Operation(summary = "CD-03: List the code questions of an exam", description = "Hidden fixtures and answers are never returned.")
    public ResponseEntity<ApiResponse<CodeExamResponses.Questions>> questions(
            @AuthenticationPrincipal UserPrincipal user, @PathVariable Long examId) {
        return ResponseEntity.ok(ApiResponse.success(service.questions(user.getId(), examId)));
    }

    @PostMapping("/run")
    @Operation(summary = "CD-04: Run source against a public sample", description = "5 s CPU / 256 MB, isolated Judge0 container, no network.")
    public ResponseEntity<ApiResponse<CodeExamResponses.RunResult>> run(
            @AuthenticationPrincipal UserPrincipal user,
            @Valid @RequestBody CodeExamRequests.Run request) {
        return ResponseEntity.ok(ApiResponse.success(service.run(user.getId(), request)));
    }

    @PostMapping("/submit")
    @Operation(summary = "CD-05: Submit code answers", description = "Judges every fixture (public and hidden) and scores the running attempt.")
    public ResponseEntity<ApiResponse<CodeExamResponses.Submitted>> submit(
            @AuthenticationPrincipal UserPrincipal user,
            @Valid @RequestBody CodeExamRequests.Submit request) {
        return ResponseEntity.ok(ApiResponse.success(service.submit(user.getId(), request), "Submitted"));
    }

    @GetMapping("/languages")
    @Operation(summary = "CD-06: Supported programming languages")
    public ResponseEntity<ApiResponse<List<CodeExamResponses.Language>>> languages() {
        return ResponseEntity.ok(ApiResponse.success(service.languages()));
    }

    @GetMapping("/{examId}/submissions")
    @Operation(summary = "CD-07: Submission history of an exam")
    public ResponseEntity<ApiResponse<PageResponse<CodeExamResponses.SubmissionItem>>> submissions(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable Long examId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size) {
        return ResponseEntity.ok(ApiResponse.success(service.submissions(user.getId(), examId, page, size)));
    }
}
