package com.examprep.controllers;

import com.examprep.dto.ApiResponse;
import com.examprep.dto.PageResponse;
import com.examprep.dto.student.*;
import com.examprep.security.UserPrincipal;
import com.examprep.services.student.StudentCourseService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/student")
@RequiredArgsConstructor
@Tag(name = "Student Course & Content", description = "Student course catalog, enrollment, and learning content APIs")
public class StudentCourseController {

    private final StudentCourseService studentCourseService;

    @GetMapping("/courses")
    @Operation(summary = "CL-01: Public Course Catalog")
    public ResponseEntity<ApiResponse<PageResponse<CourseCardDto>>> listCourses(
            @RequestParam(required = false) Long categoryId,
            @RequestParam(required = false) String keyword,
            @RequestParam(defaultValue = "newest") String sort,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        Long userId = currentUser != null ? currentUser.getId() : null;
        Page<CourseCardDto> p = studentCourseService.listCourses(categoryId, keyword, sort, page, size, userId);
        return ResponseEntity.ok(ApiResponse.success(PageResponse.of(p)));
    }

    @GetMapping("/courses/{courseId}")
    @Operation(summary = "CL-02: Course Detail")
    public ResponseEntity<ApiResponse<CourseDetailDto>> getCourseDetail(
            @PathVariable Long courseId,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        Long userId = currentUser != null ? currentUser.getId() : null;
        CourseDetailDto dto = studentCourseService.getCourseDetail(courseId, userId);
        return ResponseEntity.ok(ApiResponse.success(dto));
    }

    @GetMapping("/my-courses")
    @Operation(summary = "MC-01: My Enrolled Courses")
    public ResponseEntity<ApiResponse<PageResponse<MyCourseDto>>> listMyCourses(
            @RequestParam(required = false) String status,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        Page<MyCourseDto> p = studentCourseService.listMyCourses(status, page, size, currentUser.getId());
        return ResponseEntity.ok(ApiResponse.success(PageResponse.of(p)));
    }

    @GetMapping("/courses/{courseId}/exams")
    @Operation(summary = "MC-02: Course Exams List")
    public ResponseEntity<ApiResponse<PageResponse<CourseExamDto>>> listCourseExams(
            @PathVariable Long courseId,
            @RequestParam(defaultValue = "newest") String sort,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        Page<CourseExamDto> p = studentCourseService.listCourseExams(courseId, sort, page, size, currentUser.getId());
        return ResponseEntity.ok(ApiResponse.success(PageResponse.of(p)));
    }

    @GetMapping("/courses/{courseId}/decks")
    @Operation(summary = "MC-03: Course Decks List")
    public ResponseEntity<ApiResponse<List<DeckDto>>> listCourseDecks(
            @PathVariable Long courseId,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        List<DeckDto> list = studentCourseService.listCourseDecks(courseId, currentUser.getId());
        return ResponseEntity.ok(ApiResponse.success(list));
    }

    @GetMapping("/decks/{deckId}/cards")
    @Operation(summary = "MC-04: Deck Cards List")
    public ResponseEntity<ApiResponse<PageResponse<CardDto>>> listDeckCards(
            @PathVariable Long deckId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        Page<CardDto> p = studentCourseService.listDeckCards(deckId, page, size, currentUser.getId());
        return ResponseEntity.ok(ApiResponse.success(PageResponse.of(p)));
    }
}
