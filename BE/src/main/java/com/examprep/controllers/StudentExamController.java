package com.examprep.controllers;

import com.examprep.dto.ApiResponse;
import com.examprep.dto.PageResponse;
import com.examprep.dto.student.*;
import com.examprep.security.UserPrincipal;
import com.examprep.services.student.StudentExamService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/student")
@RequiredArgsConstructor
@Tag(name = "Student Exam", description = "Student exam detail and attempt tracking APIs")
public class StudentExamController {

    private final StudentExamService studentExamService;

    @GetMapping("/exams/{examId}")
    @Operation(summary = "EX-01: Exam Detail & Stats")
    public ResponseEntity<ApiResponse<ExamDetailDto>> getExamDetail(
            @PathVariable Long examId,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        ExamDetailDto dto = studentExamService.getExamDetail(examId, currentUser.getId());
        return ResponseEntity.ok(ApiResponse.success(dto));
    }

    @GetMapping("/exams/{examId}/active-attempt")
    @Operation(summary = "EX-02: Active Attempt")
    public ResponseEntity<ApiResponse<ActiveAttemptDto>> getActiveAttempt(
            @PathVariable Long examId,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        ActiveAttemptDto dto = studentExamService.getActiveAttempt(examId, currentUser.getId());
        return ResponseEntity.ok(ApiResponse.success(dto));
    }


    @GetMapping("/my-exams")
    @Operation(summary = "ME-01: My Past Exam Attempts")
    public ResponseEntity<ApiResponse<PageResponse<MyExamDto>>> listMyExams(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        Page<MyExamDto> p = studentExamService.listMyExams(page, size, currentUser.getId());
        return ResponseEntity.ok(ApiResponse.success(PageResponse.of(p)));
    }


}
