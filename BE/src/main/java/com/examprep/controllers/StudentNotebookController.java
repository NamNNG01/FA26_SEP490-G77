package com.examprep.controllers;

import com.examprep.dto.ApiResponse;
import com.examprep.dto.PageResponse;
import com.examprep.dto.student.QuestionReviewItemDto;
import com.examprep.dto.student.ReviewSessionRequestDto;
import com.examprep.dto.student.ReviewSessionResponseDto;
import com.examprep.security.UserPrincipal;
import com.examprep.services.student.StudentNotebookService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import com.examprep.exceptions.BadRequestException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/student/questions")
@RequiredArgsConstructor
@Tag(name = "Student Notebook", description = "Student mistake notebook and saved questions APIs")
public class StudentNotebookController {

    private final StudentNotebookService notebookService;

    @GetMapping("/saved")
    @Operation(summary = "MN-01: List Saved / Wrong Questions")
    public ResponseEntity<ApiResponse<PageResponse<QuestionReviewItemDto>>> listSavedQuestions(
            @RequestParam(defaultValue = "all") String type,
            @RequestParam(required = false) String examType,
            @RequestParam(required = false) Long courseId,
            @RequestParam(required = false) Long categoryId,
            @RequestParam(required = false) String search,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        Page<QuestionReviewItemDto> p = notebookService.listSavedQuestions(type, examType, courseId, categoryId, search, page, size, currentUser.getId());
        return ResponseEntity.ok(ApiResponse.success(PageResponse.of(p)));
    }

    @PostMapping("/{questionId}/bookmark")
    @Operation(summary = "MN-02: Toggle Question Bookmark")
    public ResponseEntity<ApiResponse<Map<String, Object>>> toggleBookmark(
            @PathVariable Long questionId,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        Map<String, Object> data = notebookService.toggleBookmark(questionId, currentUser.getId());
        return ResponseEntity.ok(ApiResponse.success(data));
    }

    @DeleteMapping("/saved/{reviewId}")
    @Operation(summary = "MN-03: Remove from Mistake Notebook")
    public ResponseEntity<ApiResponse<Void>> deleteSavedQuestion(
            @PathVariable Long reviewId,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        notebookService.deleteSavedQuestion(reviewId, currentUser.getId());
        return ResponseEntity.ok(ApiResponse.success(null, "Deleted"));
    }

    @PostMapping("/review-session")
    @Operation(summary = "MN-04: Start Review Practice Session")
    public ResponseEntity<ApiResponse<ReviewSessionResponseDto>> startReviewSession(
            @Valid @RequestBody ReviewSessionRequestDto request,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        ReviewSessionResponseDto dto = notebookService.startReviewSession(request, currentUser.getId());
        return ResponseEntity.ok(ApiResponse.success(dto, "Review session started"));
    }

    @GetMapping("/weak-spots")
    @Operation(summary = "MN-05: Weak Spots")
    public ResponseEntity<ApiResponse<List<QuestionReviewItemDto>>> getWeakSpots(
            @RequestParam(defaultValue = "5") int limit,
            @RequestParam(required = false) Long courseId,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        List<QuestionReviewItemDto> list = notebookService.getWeakSpots(limit, courseId, currentUser.getId());
        return ResponseEntity.ok(ApiResponse.success(list));
    }

    @DeleteMapping("/bookmarks")
    @Operation(summary = "Clear all bookmarks")
    public ResponseEntity<ApiResponse<Void>> deleteAllBookmarks(@AuthenticationPrincipal UserPrincipal currentUser) {
        notebookService.deleteAllBookmarks(currentUser.getId());
        return ResponseEntity.ok(ApiResponse.success(null, "All bookmarks removed"));
    }

    @PostMapping("/bookmarks/all")
    @Operation(summary = "Bookmark all saved questions")
    public ResponseEntity<ApiResponse<Void>> bookmarkAll(@AuthenticationPrincipal UserPrincipal currentUser) {
        notebookService.bookmarkAll(currentUser.getId());
        return ResponseEntity.ok(ApiResponse.success(null, "All questions bookmarked"));
    }

    @DeleteMapping("/saved")
    @Operation(summary = "Delete all saved questions in notebook")
    public ResponseEntity<ApiResponse<Void>> deleteAllSavedQuestions(@AuthenticationPrincipal UserPrincipal currentUser) {
        notebookService.deleteAllSavedQuestions(currentUser.getId());
        return ResponseEntity.ok(ApiResponse.success(null, "All saved questions deleted"));
    }

    @GetMapping({"/saved/export", "/saved/export/pdf"})
    @Operation(summary = "Export question notebook as PDF")
    public ResponseEntity<byte[]> exportSavedQuestions(
            @AuthenticationPrincipal UserPrincipal currentUser,
            @RequestParam(required = false) Long courseId,
            @RequestParam(defaultValue = "all") String type,
            @RequestParam(required = false) String examType,
            @RequestParam(defaultValue = "pdf") String format
    ) {
        if (!"pdf".equalsIgnoreCase(format)) {
            throw new BadRequestException("Invalid export format. Supported: pdf");
        }
        com.examprep.util.QuestionNotebookPdfWriter.RenderedPdf pdf = notebookService.exportSavedQuestionsPdf(currentUser.getId(), courseId, type, examType);
        return ResponseEntity.ok().contentType(MediaType.APPLICATION_PDF)
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + pdf.fileName() + "\"")
                .body(pdf.content());
    }
}
