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
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/manager/question-issues")
@RequiredArgsConstructor
@Tag(name = "Manager Question Issues", description = "Ticket queue of reported questions, corrections and regrade jobs")
public class ManagerQuestionIssueController {
    private final QuestionIssueService service;

    @GetMapping
    @Operation(summary = "Ticket queue of the caller's courses", description = "sort: createdAt | updatedAt | lastReportedAt | priority, then ,asc or ,desc (default createdAt,desc)")
    public ResponseEntity<ApiResponse<PageResponse<ListItem>>> list(@AuthenticationPrincipal UserPrincipal me,
                                                                    @RequestParam(required = false) String status,
                                                                    @RequestParam(required = false) String issueType,
                                                                    @RequestParam(required = false) Long courseId,
                                                                    @RequestParam(required = false) Long questionId,
                                                                    @RequestParam(required = false) String search,
                                                                    @RequestParam(defaultValue = "0") int page,
                                                                    @RequestParam(defaultValue = "20") int size,
                                                                    @RequestParam(required = false) String sort) {
        return ResponseEntity.ok(ApiResponse.success(service.managerList(me, status, issueType, courseId, questionId, search, page, size, sort)));
    }

    @GetMapping("/{issueId}")
    @Operation(summary = "Ticket with the question and every student report")
    public ResponseEntity<ApiResponse<ManagerDetail>> detail(@AuthenticationPrincipal UserPrincipal me, @PathVariable Long issueId) {
        return ResponseEntity.ok(ApiResponse.success(service.managerDetail(me, issueId)));
    }

    @PatchMapping("/{issueId}/assign")
    @Operation(summary = "Assign the ticket (assignedTo null unassigns)")
    public ResponseEntity<ApiResponse<ManagerDetail>> assign(@AuthenticationPrincipal UserPrincipal me, @PathVariable Long issueId,
                                                             @RequestBody(required = false) AssignRequest body) {
        return ResponseEntity.ok(ApiResponse.success(service.assign(me, issueId, body), "Ticket assigned"));
    }

    @PatchMapping("/{issueId}/status")
    @Operation(summary = "Start review (IN_PROGRESS) or reject (REJECTED, note required)")
    public ResponseEntity<ApiResponse<ManagerDetail>> status(@AuthenticationPrincipal UserPrincipal me, @PathVariable Long issueId,
                                                             @Valid @RequestBody StatusRequest body) {
        return ResponseEntity.ok(ApiResponse.success(service.changeStatus(me, issueId, body), "Ticket updated"));
    }

    @PostMapping("/{issueId}/duplicate")
    @Operation(summary = "Close the ticket as a duplicate of another one")
    public ResponseEntity<ApiResponse<ManagerDetail>> duplicate(@AuthenticationPrincipal UserPrincipal me, @PathVariable Long issueId,
                                                                @Valid @RequestBody DuplicateRequest body) {
        return ResponseEntity.ok(ApiResponse.success(service.markDuplicate(me, issueId, body), "Ticket marked as duplicate"));
    }

    @PostMapping("/{issueId}/resolve")
    @Operation(summary = "Correct the question and resolve; may create a regrade job waiting for confirmation")
    public ResponseEntity<ApiResponse<ResolveResult>> resolve(@AuthenticationPrincipal UserPrincipal me, @PathVariable Long issueId,
                                                              @Valid @RequestBody ResolveRequest body) {
        return ResponseEntity.ok(ApiResponse.success(service.resolve(me, issueId, body), "Ticket resolved"));
    }

    @GetMapping("/{issueId}/history")
    @Operation(summary = "Ticket history")
    public ResponseEntity<ApiResponse<List<HistoryView>>> history(@AuthenticationPrincipal UserPrincipal me, @PathVariable Long issueId) {
        return ResponseEntity.ok(ApiResponse.success(service.history(me, issueId)));
    }

    @GetMapping("/{issueId}/regrade-jobs")
    @Operation(summary = "Regrade jobs of the ticket")
    public ResponseEntity<ApiResponse<List<JobView>>> jobs(@AuthenticationPrincipal UserPrincipal me, @PathVariable Long issueId) {
        return ResponseEntity.ok(ApiResponse.success(service.jobs(me, issueId)));
    }

    @PostMapping("/{issueId}/regrade/confirm")
    @Operation(summary = "Confirm (runs it) or cancel a pending regrade job")
    public ResponseEntity<ApiResponse<JobView>> confirm(@AuthenticationPrincipal UserPrincipal me, @PathVariable Long issueId,
                                                        @Valid @RequestBody ConfirmRegradeRequest body) {
        return ResponseEntity.ok(ApiResponse.success(service.confirmRegrade(me, issueId, body), "Regrade job updated"));
    }

    @PostMapping("/regrade-jobs/{jobId}/retry")
    @Operation(summary = "Retry a failed or partly failed regrade job")
    public ResponseEntity<ApiResponse<JobView>> retry(@AuthenticationPrincipal UserPrincipal me, @PathVariable Long jobId) {
        return ResponseEntity.ok(ApiResponse.success(service.retryJob(me, jobId), "Regrade job retried"));
    }
}
