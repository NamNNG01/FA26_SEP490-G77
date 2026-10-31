package com.examprep.controllers;

import com.examprep.dto.ApiResponse;
import com.examprep.dto.PageResponse;
import com.examprep.dto.student.*;
import com.examprep.security.UserPrincipal;
import com.examprep.services.student.StudentContestService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/student/contests")
@RequiredArgsConstructor
@Tag(name = "Student Contest", description = "Student contest participation, exam, leaderboard and rewards APIs")
public class StudentContestController {

    private final StudentContestService contestService;

    @GetMapping
    @Operation(summary = "CT-01: List Contests")
    public ResponseEntity<ApiResponse<PageResponse<ContestItemDto>>> listContests(
            @RequestParam(required = false) String status,
            @RequestParam(required = false) Long courseId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant to,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        Long userId = currentUser != null ? currentUser.getId() : null;
        Page<ContestItemDto> p = contestService.listContests(status, courseId, from, to, page, size, userId);
        return ResponseEntity.ok(ApiResponse.success(PageResponse.of(p)));
    }

    @PostMapping("/{contestId}/register")
    @Operation(summary = "CT-02: Register for Contest")
    public ResponseEntity<ApiResponse<Map<String, Object>>> registerContest(
            @PathVariable Long contestId,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        Map<String, Object> data = contestService.registerContest(contestId, currentUser.getId());
        return ResponseEntity.status(org.springframework.http.HttpStatus.CREATED)
                .body(ApiResponse.success(data, "Registered successfully"));
    }

    @PostMapping("/{contestId}/start")
    @Operation(summary = "CT-03: Start Contest Exam")
    public ResponseEntity<ApiResponse<ContestStartResponseDto>> startContest(
            @PathVariable Long contestId,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        ContestStartResponseDto dto = contestService.startContest(contestId, currentUser.getId());
        return ResponseEntity.ok(ApiResponse.success(dto, "Contest started"));
    }

    @GetMapping("/{contestId}/leaderboard")
    @Operation(summary = "CT-04: Contest Leaderboard")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getLeaderboard(
            @PathVariable Long contestId,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        Long userId = currentUser != null ? currentUser.getId() : null;
        Map<String, Object> data = contestService.getLeaderboard(contestId, userId);
        return ResponseEntity.ok(ApiResponse.success(data));
    }

    @GetMapping("/{contestId}/result")
    @Operation(summary = "CT-05: Contest Result & Rewards")
    public ResponseEntity<ApiResponse<ContestResultDto>> getContestResult(
            @PathVariable Long contestId,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        ContestResultDto dto = contestService.getContestResult(contestId, currentUser.getId());
        return ResponseEntity.ok(ApiResponse.success(dto));
    }

    @GetMapping("/history")
    @Operation(summary = "CT-06: Contest Participation History")
    public ResponseEntity<ApiResponse<PageResponse<ContestHistoryItemDto>>> listContestHistory(
            @RequestParam(required = false) Long courseId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant to,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        Page<ContestHistoryItemDto> p = contestService.listContestHistory(courseId, from, to, page, size, currentUser.getId());
        return ResponseEntity.ok(ApiResponse.success(PageResponse.of(p)));
    }

    @PostMapping("/{contestId}/claim-reward")
    @Operation(summary = "CT-07: Claim Contest Reward")
    public ResponseEntity<ApiResponse<ClaimRewardResponseDto>> claimReward(
            @PathVariable Long contestId,
            @RequestBody Map<String, Long> body,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        Long rewardId = body.get("rewardId");
        ClaimRewardResponseDto dto = contestService.claimReward(contestId, rewardId, currentUser.getId());
        return ResponseEntity.ok(ApiResponse.success(dto, "Reward claimed"));
    }
}
