package com.examprep.controllers;

import com.examprep.dto.ApiResponse;
import com.examprep.dto.PageResponse;
import com.examprep.dto.discussion.DiscussionManagerDtos;
import com.examprep.dto.student.DiscussionDetailDto;
import com.examprep.dto.student.DiscussionItemDto;
import com.examprep.dto.student.UpdateDiscussionRequestDto;
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

@RestController
@RequestMapping("/api/v1/manager")
@RequiredArgsConstructor
@Tag(name = "Manager Discussions", description = "Course manager discussion creation, moderation, approval and comment control APIs")
public class ManagerDiscussionController {

    private final ManagerDiscussionService managerDiscussionService;

    @PostMapping("/courses/{courseId}/discussions")
    @Operation(summary = "MD-01: Manager creates discussion / announcement",
            description = "Creates an approved discussion or announcement in a managed course. Supports optional image and pin flag.")
    public ResponseEntity<ApiResponse<DiscussionDetailDto>> createDiscussion(
            @PathVariable Long courseId,
            @Valid @RequestBody DiscussionManagerDtos.CreateDiscussionRequest request,
            @AuthenticationPrincipal UserPrincipal user
    ) {
        DiscussionDetailDto dto = managerDiscussionService.createDiscussion(courseId, request, user.getId());
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(dto, "Discussion created successfully"));
    }

    @GetMapping("/courses/{courseId}/discussions")
    @Operation(summary = "MD-02: Manager lists course discussions",
            description = "Lists discussions in a managed course with optional filtering by approvalStatus (PENDING, APPROVED, REJECTED, ALL) and status (OPEN, CLOSED, HIDDEN, ALL).")
    public ResponseEntity<ApiResponse<PageResponse<DiscussionItemDto>>> listDiscussions(
            @PathVariable Long courseId,
            @RequestParam(required = false, defaultValue = "PENDING") String approvalStatus,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String search,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @AuthenticationPrincipal UserPrincipal user
    ) {
        Page<DiscussionItemDto> p = managerDiscussionService.listDiscussions(courseId, approvalStatus, status, search, page, size, user.getId());
        return ResponseEntity.ok(ApiResponse.success(PageResponse.of(p)));
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
            description = "Pins or unpins a discussion to keep it at the top of the course discussion list.")
    public ResponseEntity<ApiResponse<DiscussionItemDto>> updatePin(
            @PathVariable Long discussionId,
            @Valid @RequestBody DiscussionManagerDtos.UpdatePinRequest request,
            @AuthenticationPrincipal UserPrincipal user
    ) {
        DiscussionItemDto dto = managerDiscussionService.updatePin(discussionId, request, user.getId());
        return ResponseEntity.ok(ApiResponse.success(dto, Boolean.TRUE.equals(request.getIsPinned()) ? "Discussion pinned" : "Discussion unpinned"));
    }

    @PatchMapping("/discussions/{discussionId}/close")
    @Operation(summary = "MD-07: Manager closes or reopens discussion",
            description = "Closes or reopens any discussion in the managed course.")
    public ResponseEntity<ApiResponse<DiscussionItemDto>> updateClose(
            @PathVariable Long discussionId,
            @Valid @RequestBody UpdateDiscussionRequestDto request,
            @AuthenticationPrincipal UserPrincipal user
    ) {
        DiscussionItemDto dto = managerDiscussionService.updateClose(discussionId, request, user.getId());
        return ResponseEntity.ok(ApiResponse.success(dto, Boolean.TRUE.equals(request.getIsClosed()) ? "Discussion closed" : "Discussion reopened"));
    }

    @DeleteMapping("/discussions/{discussionId}")
    @Operation(summary = "MD-08: Manager deletes discussion",
            description = "Permanently deletes an inappropriate or violated discussion.")
    public ResponseEntity<ApiResponse<Void>> deleteDiscussion(
            @PathVariable Long discussionId,
            @AuthenticationPrincipal UserPrincipal user
    ) {
        managerDiscussionService.deleteDiscussion(discussionId, user.getId());
        return ResponseEntity.ok(ApiResponse.success(null, "Discussion deleted"));
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
    @Operation(summary = "MD-10: Manager deletes comment",
            description = "Permanently deletes an inappropriate comment.")
    public ResponseEntity<ApiResponse<Void>> deleteComment(
            @PathVariable Long commentId,
            @AuthenticationPrincipal UserPrincipal user
    ) {
        managerDiscussionService.deleteComment(commentId, user.getId());
        return ResponseEntity.ok(ApiResponse.success(null, "Comment deleted"));
    }
}
