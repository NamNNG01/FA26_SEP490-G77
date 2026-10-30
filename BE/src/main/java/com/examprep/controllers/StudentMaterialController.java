package com.examprep.controllers;

import com.examprep.dto.ApiResponse;
import com.examprep.dto.PageResponse;
import com.examprep.dto.student.MaterialRequests;
import com.examprep.dto.student.MaterialResponses;
import com.examprep.security.UserPrincipal;
import com.examprep.services.StudentMaterialService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;

import com.examprep.exceptions.BadRequestException;

@RestController
@RequestMapping("/api/v1/student/materials")
@RequiredArgsConstructor
@Tag(name = "Student Materials", description = "MQ-01 … MQ-06: material upload and material-based quiz generation")
public class StudentMaterialController {
    private final StudentMaterialService service;

    @PostMapping
    @Operation(summary = "MQ-01: Upload a material (PDF/DOCX, max 20 MB)")
    public ResponseEntity<ApiResponse<MaterialResponses.Uploaded>> upload(
            @AuthenticationPrincipal UserPrincipal user,
            @RequestParam MultipartFile file,
            @RequestParam Long courseId,
            @RequestParam(required = false) String title) {
        byte[] bytes;
        try {
            bytes = file.getBytes();
        } catch (IOException ex) {
            throw new BadRequestException("Could not read the uploaded file.");
        }
        return ResponseEntity.status(201)
                .body(ApiResponse.success(service.upload(user.getId(), file.getOriginalFilename(), bytes,
                        courseId, title), "Uploaded"));
    }

    @GetMapping
    @Operation(summary = "MQ-02: List my materials")
    public ResponseEntity<ApiResponse<PageResponse<MaterialResponses.DocumentItem>>> list(
            @AuthenticationPrincipal UserPrincipal user,
            @RequestParam(required = false) Long courseId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size) {
        return ResponseEntity.ok(ApiResponse.success(service.list(user.getId(), courseId, page, size)));
    }

    @GetMapping("/lookup")
    @Operation(summary = "A material of mine with the same content (SHA-256), or 404")
    public ResponseEntity<ApiResponse<MaterialResponses.Lookup>> lookup(
            @AuthenticationPrincipal UserPrincipal user, @RequestParam String sha256) {
        return ResponseEntity.ok(ApiResponse.success(service.lookup(user.getId(), sha256)));
    }

    @PostMapping("/{documentId}/courses")
    @Operation(summary = "Attach an existing material to another course of mine")
    public ResponseEntity<ApiResponse<MaterialResponses.Lookup>> attachCourse(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable Long documentId,
            @Valid @RequestBody MaterialRequests.AttachCourse request) {
        return ResponseEntity.ok(ApiResponse.success(
                service.attachCourse(user.getId(), documentId, request.courseId()), "Material attached"));
    }

    @DeleteMapping("/{documentId}")
    @Operation(summary = "Delete one of my materials")
    public ResponseEntity<ApiResponse<Void>> delete(
            @AuthenticationPrincipal UserPrincipal user, @PathVariable Long documentId) {
        service.delete(user.getId(), documentId);
        return ResponseEntity.ok(ApiResponse.success(null, "Material deleted"));
    }

    @PostMapping("/{documentId}/generate-quiz")
    @Operation(summary = "MQ-03: Generate a quiz from a material", description = "Reserves AI quota and queues the job; 429 QUOTA_EXCEEDED carries estimatedTokens, availableTokens and quota.")
    public ResponseEntity<ApiResponse<MaterialResponses.JobAccepted>> generate(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable Long documentId,
            @Valid @RequestBody MaterialRequests.GenerateQuiz request) {
        return ResponseEntity.status(202)
                .body(ApiResponse.success(service.generateQuiz(user.getId(), documentId, request), "Accepted"));
    }

    @GetMapping("/quiz-jobs/{jobId}")
    @Operation(summary = "MQ-04: Poll a generation job", description = "Poll every 2 seconds (Retry-After header).")
    public ResponseEntity<ApiResponse<MaterialResponses.JobState>> job(
            @AuthenticationPrincipal UserPrincipal user, @PathVariable Long jobId) {
        return ResponseEntity.ok()
                .header("Retry-After", "2")
                .body(ApiResponse.success(service.job(user.getId(), jobId)));
    }

    @PostMapping("/quiz-jobs/{jobId}/start")
    @Operation(summary = "MQ-05: Start a completed generated quiz")
    public ResponseEntity<ApiResponse<MaterialResponses.Started>> start(
            @AuthenticationPrincipal UserPrincipal user, @PathVariable Long jobId) {
        return ResponseEntity.ok(ApiResponse.success(service.start(user.getId(), jobId), "Quiz started"));
    }

    @GetMapping("/quiz-history")
    @Operation(summary = "MQ-06: History of generated quizzes")
    public ResponseEntity<ApiResponse<PageResponse<MaterialResponses.HistoryItem>>> history(
            @AuthenticationPrincipal UserPrincipal user,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size) {
        return ResponseEntity.ok(ApiResponse.success(service.history(user.getId(), page, size)));
    }
}
