package com.examprep.controllers;

import com.examprep.dto.ApiResponse;
import com.examprep.dto.PageResponse;
import com.examprep.dto.discussion.DiscussionManagerDtos;
import com.examprep.dto.student.DiscussionDetailDto;
import com.examprep.dto.student.DiscussionItemDto;
import com.examprep.security.UserPrincipal;
import com.examprep.services.ManagerDiscussionService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/admin")
@RequiredArgsConstructor
@Tag(name = "Admin Discussions", description = "Admin global discussion moderation, approval, reports and user mute APIs")
public class ManagerDiscussionController {

    private final ManagerDiscussionService managerDiscussionService;

    @PostMapping("/discussions")
    @Operation(summary = "MD-01: Manager creates discussion / announcement",
            description = "Creates an approved global discussion or announcement. Supports optional image and pin flag.")
    public ResponseEntity<ApiResponse<DiscussionDetailDto>> createDiscussion(
            @Valid @RequestBody DiscussionManagerDtos.CreateDiscussionRequest request,
            @AuthenticationPrincipal UserPrincipal user
    ) {
        DiscussionDetailDto dto = managerDiscussionService.createDiscussion(request, user.getId());
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(dto, "Discussion created successfully"));
    }

    @GetMapping("/discussions")
    @Operation(summary = "AD-02: Admin lists discussions",
            description = "Lists global discussions with optional filtering by approvalStatus, status, tag, hasImage, search and sort (latest or oldest).")
    public ResponseEntity<ApiResponse<PageResponse<DiscussionItemDto>>> listDiscussions(
            @RequestParam(required = false, defaultValue = "PENDING") String approvalStatus,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String tag,
            @RequestParam(required = false) Boolean hasImage,
            @RequestParam(required = false) String search,
            @RequestParam(required = false, defaultValue = "oldest") String sort,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @AuthenticationPrincipal UserPrincipal user
    ) {
        Page<DiscussionItemDto> p = managerDiscussionService.listDiscussions(
                approvalStatus, status, tag, hasImage, search, sort, page, size, user.getId());
        return ResponseEntity.ok(ApiResponse.success(PageResponse.of(p)));
    }

    @GetMapping("/discussions/summary")
    @Operation(summary = "AD-02B: Admin moderation summary",
            description = "Returns pending discussions count, pending reports count, and rejection reason templates.")
    public ResponseEntity<ApiResponse<DiscussionManagerDtos.ModerationSummaryDto>> getSummary(
            @AuthenticationPrincipal UserPrincipal user
    ) {
        return ResponseEntity.ok(ApiResponse.success(managerDiscussionService.getModerationSummary(user.getId())));
    }

    @GetMapping("/discussions/{discussionId}")
    @Operation(summary = "MD-03: Manager views discussion detail",
            description = "Returns discussion detail along with all comments (including hidden ones) for management.")
    public ResponseEntity<ApiResponse<DiscussionDetailDto>> getDiscussionDetail(
            @PathVariable Long discussionId,
            @AuthenticationPrincipal UserPrincipal user
    ) {
        DiscussionDetailDto dto = managerDiscussionService.getDiscussionDetail(discussionId, user.getId());
        return ResponseEntity.ok(ApiResponse.success(dto));
    }

    @PostMapping("/discussions/{discussionId}/approve")
    @Operation(summary = "MD-04: Manager approves student discussion",
            description = "Approves a pending discussion so it becomes visible on the student feed.")
    public ResponseEntity<ApiResponse<DiscussionItemDto>> approveDiscussion(
            @PathVariable Long discussionId,
            @AuthenticationPrincipal UserPrincipal user
    ) {
        DiscussionItemDto dto = managerDiscussionService.approveDiscussion(discussionId, user.getId());
        return ResponseEntity.ok(ApiResponse.success(dto, "Discussion approved"));
    }

    @PostMapping("/discussions/{discussionId}/reject")
    @Operation(summary = "MD-05: Manager rejects student discussion",
            description = "Rejects a discussion with a reason provided in the request body.")
    public ResponseEntity<ApiResponse<DiscussionItemDto>> rejectDiscussion(
            @PathVariable Long discussionId,
            @Valid @RequestBody DiscussionManagerDtos.RejectDiscussionRequest request,
            @AuthenticationPrincipal UserPrincipal user
    ) {
        DiscussionItemDto dto = managerDiscussionService.rejectDiscussion(discussionId, request, user.getId());
        return ResponseEntity.ok(ApiResponse.success(dto, "Discussion rejected"));
    }

    @PatchMapping("/discussions/{discussionId}/pin")
    @Operation(summary = "MD-06: Manager pins or unpins discussion",
            description = "Pins or unpins an approved global discussion.")
    public ResponseEntity<ApiResponse<DiscussionItemDto>> updatePin(
            @PathVariable Long discussionId,
            @Valid @RequestBody DiscussionManagerDtos.UpdatePinRequest request,
            @AuthenticationPrincipal UserPrincipal user
    ) {
        DiscussionItemDto dto = managerDiscussionService.updatePin(discussionId, request, user.getId());
        return ResponseEntity.ok(ApiResponse.success(dto, Boolean.TRUE.equals(request.getIsPinned()) ? "Discussion pinned" : "Discussion unpinned"));
    }

    @PostMapping("/discussions/{discussionId}/hide")
    @Operation(summary = "MD-08: Manager hides discussion",
            description = "Hides a discussion from the public feed while keeping it visible to its author in My Discussions.")
    public ResponseEntity<ApiResponse<DiscussionItemDto>> hideDiscussion(
            @PathVariable Long discussionId,
            @AuthenticationPrincipal UserPrincipal user
    ) {
        DiscussionItemDto dto = managerDiscussionService.hideDiscussion(discussionId, user.getId());
        return ResponseEntity.ok(ApiResponse.success(dto, "Discussion hidden"));
    }

    @PostMapping("/discussions/{discussionId}/restore")
    @Operation(summary = "MD-08: Manager restores discussion",
            description = "Restores a hidden discussion to the public feed and reopens it for replies.")
    public ResponseEntity<ApiResponse<DiscussionItemDto>> restoreDiscussion(
            @PathVariable Long discussionId,
            @AuthenticationPrincipal UserPrincipal user
    ) {
        DiscussionItemDto dto = managerDiscussionService.restoreDiscussion(discussionId, user.getId());
        return ResponseEntity.ok(ApiResponse.success(dto, "Discussion restored"));
    }

    @PatchMapping("/discussions/comments/{commentId}/status")
    @Operation(summary = "MD-09: Manager hides or restores comment",
            description = "Sets comment status to HIDDEN or VISIBLE to moderate inappropriate comments.")
    public ResponseEntity<ApiResponse<DiscussionDetailDto.CommentDto>> updateCommentStatus(
            @PathVariable Long commentId,
            @Valid @RequestBody DiscussionManagerDtos.UpdateCommentStatusRequest request,
            @AuthenticationPrincipal UserPrincipal user
    ) {
        DiscussionDetailDto.CommentDto dto = managerDiscussionService.updateCommentStatus(commentId, request, user.getId());
        return ResponseEntity.ok(ApiResponse.success(dto, "Comment status updated to " + request.getStatus()));
    }

    @DeleteMapping("/discussions/comments/{commentId}")
    @Operation(summary = "MD-10: Admin deletes comment",
            description = "Permanently deletes an inappropriate comment.")
    public ResponseEntity<ApiResponse<Void>> deleteComment(
            @PathVariable Long commentId,
            @AuthenticationPrincipal UserPrincipal user
    ) {
        managerDiscussionService.deleteComment(commentId, user.getId());
        return ResponseEntity.ok(ApiResponse.success(null, "Comment deleted"));
    }

    @PostMapping("/discussions/bulk-approve")
    @Operation(summary = "AD-11: Admin bulk approves discussions")
    public ResponseEntity<ApiResponse<Map<String, Integer>>> bulkApprove(
            @Valid @RequestBody DiscussionManagerDtos.BulkIdsRequest request,
            @AuthenticationPrincipal UserPrincipal user
    ) {
        int count = managerDiscussionService.bulkApproveDiscussions(request.getDiscussionIds(), user.getId());
        return ResponseEntity.ok(ApiResponse.success(Map.of("updatedCount", count), "Approved " + count + " discussions"));
    }

    @PostMapping("/discussions/bulk-reject")
    @Operation(summary = "AD-12: Admin bulk rejects discussions")
    public ResponseEntity<ApiResponse<Map<String, Integer>>> bulkReject(
            @Valid @RequestBody DiscussionManagerDtos.BulkRejectRequest request,
            @AuthenticationPrincipal UserPrincipal user
    ) {
        int count = managerDiscussionService.bulkRejectDiscussions(request.getDiscussionIds(), request.getReason(), user.getId());
        return ResponseEntity.ok(ApiResponse.success(Map.of("updatedCount", count), "Rejected " + count + " discussions"));
    }

    @GetMapping("/discussions/reports")
    @Operation(summary = "AD-13: Admin lists community reports")
    public ResponseEntity<ApiResponse<PageResponse<DiscussionManagerDtos.DiscussionReportItemDto>>> listReports(
            @RequestParam(required = false, defaultValue = "PENDING") String status,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @AuthenticationPrincipal UserPrincipal user
    ) {
        Page<DiscussionManagerDtos.DiscussionReportItemDto> p = managerDiscussionService.listReports(status, page, size, user.getId());
        return ResponseEntity.ok(ApiResponse.success(PageResponse.of(p)));
    }

    @PostMapping("/discussions/reports/{reportId}/resolve")
    @Operation(summary = "AD-14: Admin resolves or dismisses a report")
    public ResponseEntity<ApiResponse<DiscussionManagerDtos.DiscussionReportItemDto>> resolveReport(
            @PathVariable Long reportId,
            @Valid @RequestBody DiscussionManagerDtos.ResolveReportRequest request,
            @AuthenticationPrincipal UserPrincipal user
    ) {
        DiscussionManagerDtos.DiscussionReportItemDto dto = managerDiscussionService.resolveReport(reportId, request, user.getId());
        return ResponseEntity.ok(ApiResponse.success(dto, "Report processed"));
    }

    @PostMapping("/discussions/users/{targetUserId}/mute")
    @Operation(summary = "AD-15: Admin mutes user from community")
    public ResponseEntity<ApiResponse<Void>> muteUser(
            @PathVariable Long targetUserId,
            @Valid @RequestBody DiscussionManagerDtos.MuteUserRequest request,
            @AuthenticationPrincipal UserPrincipal user
    ) {
        managerDiscussionService.muteUser(targetUserId, request, user.getId());
        return ResponseEntity.ok(ApiResponse.success(null, "User muted from community"));
    }

    @PostMapping("/discussions/users/{targetUserId}/unmute")
    @Operation(summary = "AD-16: Admin unmutes user from community")
    public ResponseEntity<ApiResponse<Void>> unmuteUser(
            @PathVariable Long targetUserId,
            @AuthenticationPrincipal UserPrincipal user
    ) {
        managerDiscussionService.unmuteUser(targetUserId, user.getId());
        return ResponseEntity.ok(ApiResponse.success(null, "User unmuted"));
    }
}
