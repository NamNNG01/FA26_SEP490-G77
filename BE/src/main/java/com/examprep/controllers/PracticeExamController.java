package com.examprep.controllers;

import com.examprep.dto.ApiResponse;
import com.examprep.dto.PageResponse;
import com.examprep.dto.student.PracticeDtos;
import com.examprep.security.UserPrincipal;
import com.examprep.services.student.PracticeExamService;
import com.fasterxml.jackson.databind.JsonNode;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/** Custom practice exams PQ-01..04 (Deadline1 section 18). Attempts use SA-01..05. */
@RestController
@RequestMapping("/api/v1/student")
@RequiredArgsConstructor
public class PracticeExamController {
    private final PracticeExamService practice;

    @PostMapping("/practice-exams")
    public ResponseEntity<ApiResponse<PracticeDtos.Created>> create(@AuthenticationPrincipal UserPrincipal user,
            @Valid @RequestBody PracticeDtos.Create request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(practice.create(user.getId(), request), "Practice exam created"));
    }

    @GetMapping("/practice-exams")
    public ResponseEntity<ApiResponse<PageResponse<PracticeDtos.Item>>> list(@AuthenticationPrincipal UserPrincipal user,
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "10") int size) {
        return ResponseEntity.ok(ApiResponse.success(practice.list(user.getId(), page, size)));
    }

    @DeleteMapping("/practice-exams/{practiceId}")
    public ResponseEntity<ApiResponse<Void>> delete(@AuthenticationPrincipal UserPrincipal user, @PathVariable Long practiceId) {
        practice.delete(user.getId(), practiceId);
        return ResponseEntity.ok(ApiResponse.success(null, "Deleted"));
    }

    @GetMapping("/attempts/{attemptId}/wrong-questions")
    public ResponseEntity<ApiResponse<List<JsonNode>>> wrongQuestions(@AuthenticationPrincipal UserPrincipal user, @PathVariable Long attemptId) {
        return ResponseEntity.ok(ApiResponse.success(practice.wrongQuestions(user.getId(), attemptId)));
    }
}
