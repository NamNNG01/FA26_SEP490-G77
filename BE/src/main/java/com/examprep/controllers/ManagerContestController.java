package com.examprep.controllers;

import com.examprep.dto.ApiResponse;
import com.examprep.dto.ContestDtos.*;
import com.examprep.dto.PageResponse;
import com.examprep.security.UserPrincipal;
import com.examprep.services.contest.ManagerContestService;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;

/** Course manager contests: Deadline 2 APIs 1-12. Bodies are validated in the service (errors carry data.code). */
@RestController
@RequestMapping("/api/v1/manager")
@RequiredArgsConstructor
public class ManagerContestController {
    private final ManagerContestService contests;

    @GetMapping("/contests")
    public ResponseEntity<ApiResponse<PageResponse<ListItem>>> list(@AuthenticationPrincipal UserPrincipal user,
            @RequestParam(required = false) String keyword, @RequestParam(required = false) String status,
            @RequestParam(required = false) Long courseId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant to,
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String sort) {
        return ResponseEntity.ok(ApiResponse.success(contests.list(user, keyword, status, courseId, from, to, page, size, sort)));
    }

    @GetMapping("/contests/{id}")
    public ResponseEntity<ApiResponse<Detail>> detail(@AuthenticationPrincipal UserPrincipal user, @PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.success(contests.detail(user, id)));
    }

    @PostMapping("/contests")
    public ResponseEntity<ApiResponse<Detail>> create(@AuthenticationPrincipal UserPrincipal user, @RequestBody ContestWrite body) {
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(contests.create(user, body), "Contest created"));
    }

    @PutMapping("/contests/{id}")
    public ResponseEntity<ApiResponse<Detail>> update(@AuthenticationPrincipal UserPrincipal user, @PathVariable Long id,
            @RequestBody ContestWrite body) {
        return ResponseEntity.ok(ApiResponse.success(contests.update(user, id, body)));
    }

    @PostMapping("/contests/{id}/publish")
    public ResponseEntity<ApiResponse<Detail>> publish(@AuthenticationPrincipal UserPrincipal user, @PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.success(contests.publish(user, id), "Contest published"));
    }

    @PostMapping("/contests/{id}/cancel")
    public ResponseEntity<ApiResponse<Detail>> cancel(@AuthenticationPrincipal UserPrincipal user, @PathVariable Long id,
            @RequestBody(required = false) CancelRequest body) {
        return ResponseEntity.ok(ApiResponse.success(contests.cancel(user, id, body == null ? null : body.reason()), "Contest cancelled"));
    }

    @DeleteMapping("/contests/{id}")
    public ResponseEntity<ApiResponse<Void>> delete(@AuthenticationPrincipal UserPrincipal user, @PathVariable Long id) {
        contests.delete(user, id);
        return ResponseEntity.ok(ApiResponse.success(null, "Deleted"));
    }

    @GetMapping("/contests/{id}/leaderboard")
    public ResponseEntity<ApiResponse<PageResponse<LeaderboardRow>>> leaderboard(@AuthenticationPrincipal UserPrincipal user,
            @PathVariable Long id, @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size) {
        return ResponseEntity.ok(ApiResponse.success(contests.leaderboard(user, id, page, size)));
    }

    @GetMapping("/contest-options/exams")
    public ResponseEntity<ApiResponse<PageResponse<ExamOption>>> examOptions(@AuthenticationPrincipal UserPrincipal user,
            @RequestParam(required = false) Long courseId, @RequestParam(required = false) String keyword,
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size) {
        return ResponseEntity.ok(ApiResponse.success(contests.examOptions(user, courseId, keyword, page, size)));
    }

    @GetMapping("/contest-options/discounts")
    public ResponseEntity<ApiResponse<PageResponse<DiscountOption>>> discountOptions(@RequestParam(required = false) String keyword,
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size) {
        return ResponseEntity.ok(ApiResponse.success(contests.discountOptions(keyword, page, size)));
    }
}
