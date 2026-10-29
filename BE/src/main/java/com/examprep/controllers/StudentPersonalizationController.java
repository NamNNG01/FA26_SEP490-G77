package com.examprep.controllers;

import com.examprep.dto.ApiResponse;
import com.examprep.dto.student.PersonalizationDtos.*;
import com.examprep.security.UserPrincipal;
import com.examprep.services.student.PersonalizationService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

/** AI personalization AI-01..04 (Deadline1 section 25). */
@RestController
@RequestMapping("/api/v1/student/ai")
@RequiredArgsConstructor
public class StudentPersonalizationController {
    private final PersonalizationService personalization;

    @PostMapping("/smart-practice")
    public ResponseEntity<ApiResponse<SmartStarted>> smartPractice(@AuthenticationPrincipal UserPrincipal user,
            @Valid @RequestBody SmartRequest request) {
        return ResponseEntity.status(HttpStatus.ACCEPTED)
                .body(ApiResponse.success(personalization.startSmartPractice(user.getId(), request), "Generating smart practice"));
    }

    @GetMapping("/smart-practice/{jobId}")
    public ResponseEntity<ApiResponse<SmartStatus>> smartStatus(@AuthenticationPrincipal UserPrincipal user, @PathVariable String jobId) {
        SmartStatus status = personalization.smartStatus(user.getId(), jobId);
        ResponseEntity.BodyBuilder reply = ResponseEntity.ok();
        if ("PROCESSING".equals(status.status())) reply.header("Retry-After", "2");
        return reply.body(ApiResponse.success(status));
    }
}
