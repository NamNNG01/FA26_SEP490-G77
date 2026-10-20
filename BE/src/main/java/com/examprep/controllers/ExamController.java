package com.examprep.controllers;

import com.examprep.dto.ApiResponse;
import com.examprep.dto.exam.*;
import com.examprep.entities.User;
import com.examprep.exceptions.ResourceNotFoundException;
import com.examprep.repositories.UserRepository;
import com.examprep.security.UserPrincipal;
import com.examprep.services.ExamService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequiredArgsConstructor
@Tag(name = "Exam Management", description = "Exam creation, matrix, publishing, attempts, and grading")
public class ExamController {

    private final ExamService examService;
    private final UserRepository userRepository;

    private User resolveUser(UserPrincipal principal) {
        return userRepository.findById(principal.getId())
                .orElseThrow(() -> new ResourceNotFoundException("User not found"));
    }

    @PostMapping("/api/v1/manager/exams/random")
    @Operation(summary = "Create random exam from criteria matrix")
    public ResponseEntity<ApiResponse<ExamResponse>> createRandomExam(
            @Valid @RequestBody ExamRandomRequest request,
            @AuthenticationPrincipal UserPrincipal currentUser) {
        User user = resolveUser(currentUser);
        ExamResponse exam = examService.createRandomExam(request, user);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(exam, "Random exam created successfully"));
    }

    @PostMapping("/api/v1/manager/exams/{examId}/publish")
    @Operation(summary = "Publish draft exam")
    public ResponseEntity<ApiResponse<ExamResponse>> publishExam(
            @PathVariable Long examId,
            @AuthenticationPrincipal UserPrincipal currentUser) {
        User user = resolveUser(currentUser);
        ExamResponse exam = examService.publishExam(examId, user);
        return ResponseEntity.ok(ApiResponse.success(exam, "Exam published successfully"));
    }

    @GetMapping("/api/v1/manager/exams/course/{courseId}")
    @Operation(summary = "Get exams for course (Manager)")
    public ResponseEntity<ApiResponse<List<ExamResponse>>> getManagerExamsForCourse(
            @PathVariable Long courseId,
            @AuthenticationPrincipal UserPrincipal currentUser) {
        User user = resolveUser(currentUser);
        List<ExamResponse> exams = examService.getExamsForCourse(courseId, user);
        return ResponseEntity.ok(ApiResponse.success(exams, "Exams retrieved successfully"));
    }

    @PutMapping("/api/v1/manager/exams/{examId}/questions/reorder")
    @Operation(summary = "Reorder questions in draft exam")
    public ResponseEntity<ApiResponse<ExamResponse>> reorderExamQuestions(
            @PathVariable Long examId,
            @Valid @RequestBody ExamReorderRequest request,
            @AuthenticationPrincipal UserPrincipal currentUser) {
        User user = resolveUser(currentUser);
        ExamResponse exam = examService.reorderExamQuestions(examId, request, user);
        return ResponseEntity.ok(ApiResponse.success(exam, "Exam questions reordered successfully"));
    }

    @PostMapping("/api/v1/manager/questions/{id}/essay-regrade")
    @Operation(summary = "Manual essay regrade for a question")
    public ResponseEntity<ApiResponse<Void>> manualEssayRegrade(
            @PathVariable Long id,
            @AuthenticationPrincipal UserPrincipal currentUser) {
        User user = resolveUser(currentUser);
        examService.manualEssayRegrade(id, user);
        return ResponseEntity.ok(ApiResponse.success(null, "Essay regrade triggered successfully"));
    }

    @GetMapping("/api/v1/student/exams/{examId}")
    @Operation(summary = "Get published exam view for student attempt")
    public ResponseEntity<ApiResponse<ExamResponse>> getStudentExamDetail(
            @PathVariable Long examId,
            @AuthenticationPrincipal UserPrincipal currentUser) {
        User user = resolveUser(currentUser);
        ExamResponse exam = examService.getExamDetail(examId, user, true);
        return ResponseEntity.ok(ApiResponse.success(exam, "Exam retrieved successfully"));
    }

    @GetMapping("/api/v1/student/exams/course/{courseId}")
    @Operation(summary = "Get published exams for enrolled course (Student)")
    public ResponseEntity<ApiResponse<List<ExamResponse>>> getStudentExamsForCourse(
            @PathVariable Long courseId,
            @AuthenticationPrincipal UserPrincipal currentUser) {
        User user = resolveUser(currentUser);
        List<ExamResponse> exams = examService.getExamsForCourse(courseId, user);
        return ResponseEntity.ok(ApiResponse.success(exams, "Exams retrieved successfully"));
    }

    @PostMapping("/api/v1/student/exams/attempts")
    @Operation(summary = "Submit student exam attempt")
    public ResponseEntity<ApiResponse<AttemptResponse>> submitAttempt(
            @Valid @RequestBody AttemptSubmitRequest request,
            @AuthenticationPrincipal UserPrincipal currentUser) {
        User user = resolveUser(currentUser);
        AttemptResponse attempt = examService.submitAttempt(request, user);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(attempt, "Attempt submitted successfully"));
    }
}
