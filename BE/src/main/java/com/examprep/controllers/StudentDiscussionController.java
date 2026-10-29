package com.examprep.controllers;

import com.examprep.dto.ApiResponse;
import com.examprep.dto.PageResponse;
import com.examprep.dto.student.*;
import com.examprep.security.UserPrincipal;
import com.examprep.services.student.StudentDiscussionService;
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
@RequestMapping("/api/v1/student")
@RequiredArgsConstructor
@Tag(name = "Student Discussions & Tips", description = "Student discussions, tips, comments, upvotes and bookmarks APIs")
public class StudentDiscussionController {

    private final StudentDiscussionService discussionService;

    @GetMapping("/discussions")
    @Operation(summary = "DI-01: List Discussions")
    public ResponseEntity<ApiResponse<PageResponse<DiscussionItemDto>>> listDiscussions(
            @RequestParam(required = false) Long courseId,
            @RequestParam(required = false) String tag,
            @RequestParam(required = false) String search,
            @RequestParam(defaultValue = "latest") String sort,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        Long userId = currentUser != null ? currentUser.getId() : null;
        Page<DiscussionItemDto> p = discussionService.listDiscussions(courseId, tag, search, sort, page, size, userId);
        return ResponseEntity.ok(ApiResponse.success(PageResponse.of(p)));
    }

    @GetMapping("/discussions/{discussionId}")
    @Operation(summary = "DI-02: Discussion Detail")
    public ResponseEntity<ApiResponse<DiscussionDetailDto>> getDiscussionDetail(
            @PathVariable Long discussionId,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        Long userId = currentUser != null ? currentUser.getId() : null;
        DiscussionDetailDto dto = discussionService.getDiscussionDetail(discussionId, userId);
        return ResponseEntity.ok(ApiResponse.success(dto));
    }

    @PostMapping("/discussions")
    @Operation(summary = "DI-03: Create Discussion")
    public ResponseEntity<ApiResponse<DiscussionItemDto>> createDiscussion(
            @Valid @RequestBody CreateDiscussionRequestDto request,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        DiscussionItemDto dto = discussionService.createDiscussion(request, currentUser.getId());
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(dto, "Discussion created successfully"));
    }

    @PostMapping("/discussions/{discussionId}/comments")
    @Operation(summary = "DI-04: Add Comment")
    public ResponseEntity<ApiResponse<DiscussionDetailDto.CommentDto>> createComment(
            @PathVariable Long discussionId,
            @Valid @RequestBody CreateCommentRequestDto request,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        DiscussionDetailDto.CommentDto dto = discussionService.createComment(discussionId, request, currentUser.getId());
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(dto, "Comment added"));
    }

    @PostMapping("/discussions/{discussionId}/upvote")
    @Operation(summary = "DI-05: Toggle Upvote")
    public ResponseEntity<ApiResponse<Map<String, Object>>> toggleUpvote(
            @PathVariable Long discussionId,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        Map<String, Object> data = discussionService.toggleUpvote(discussionId, currentUser.getId());
        return ResponseEntity.ok(ApiResponse.success(data));
    }

    @PostMapping("/discussions/{discussionId}/bookmark")
    @Operation(summary = "DI-06: Toggle Bookmark")
    public ResponseEntity<ApiResponse<Map<String, Object>>> toggleBookmark(
            @PathVariable Long discussionId,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        Map<String, Object> data = discussionService.toggleBookmark(discussionId, currentUser.getId());
        return ResponseEntity.ok(ApiResponse.success(data));
    }

    @GetMapping("/tips")
    @Operation(summary = "DI-07: List Tips")
    public ResponseEntity<ApiResponse<PageResponse<DiscussionItemDto>>> listTips(
            @RequestParam(required = false) Long courseId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        Long userId = currentUser != null ? currentUser.getId() : null;
        Page<DiscussionItemDto> p = discussionService.listTips(courseId, page, size, userId);
        return ResponseEntity.ok(ApiResponse.success(PageResponse.of(p)));
    }

    @PatchMapping("/discussions/{discussionId}")
    @Operation(summary = "DI-08: Close / Open Discussion")
    public ResponseEntity<ApiResponse<DiscussionItemDto>> updateDiscussion(
            @PathVariable Long discussionId,
            @Valid @RequestBody UpdateDiscussionRequestDto request,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        DiscussionItemDto dto = discussionService.updateDiscussion(discussionId, request, currentUser.getId());
        return ResponseEntity.ok(ApiResponse.success(dto));
    }
}
