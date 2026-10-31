package com.examprep.controllers;

import com.examprep.dto.ApiResponse;
import com.examprep.dto.ResponseCode;
import com.examprep.dto.FlashcardImportDtos.*;
import com.examprep.security.UserPrincipal;
import com.examprep.services.student.CardImportService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/v1/flashcards")
@RequiredArgsConstructor
@Tag(name = "Student Flashcard Import")
public class StudentFlashcardController {

    private final CardImportService cardImportService;

    @GetMapping("/import/template")
    @Operation(summary = "API 28: Download Flashcard Template (docx/xlsx)")
    public ResponseEntity<Resource> template(@RequestParam(defaultValue = "docx") String format) {
        String lowerFormat = format.toLowerCase().trim();
        Resource resource;
        String filename;
        MediaType mediaType;

        if ("xlsx".equals(lowerFormat)) {
            resource = new ClassPathResource("templates/import/flashcard-import-template-v1.xlsx");
            filename = "flashcard-import-template-v1.xlsx";
            mediaType = MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        } else if ("docx".equals(lowerFormat) || "".equals(lowerFormat)) {
            resource = new ClassPathResource("templates/import/flashcard-import-template-v1.docx");
            filename = "flashcard-import-template-v1.docx";
            mediaType = MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
        } else {
            throw com.examprep.services.contest.ContestRules.error(ResponseCode.BAD_REQUEST, "INVALID_FORMAT", "Invalid template format. Supported: docx, xlsx");
        }

        if (!resource.exists()) {
            resource = new ClassPathResource("templates/flashcard-import-template-v1." + lowerFormat);
            if (!resource.exists()) {
                throw com.examprep.services.contest.ContestRules.error(ResponseCode.RESOURCE_NOT_FOUND, "TEMPLATE_NOT_FOUND", "Template file not found on server");
            }
        }

        return ResponseEntity.ok()
                .contentType(mediaType)
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + filename + "\"")
                .body(resource);
    }

    @PostMapping("/import/preview")
    @Operation(summary = "API 29: Preview and validate flashcard import file")
    public ResponseEntity<ApiResponse<PreviewResponse>> preview(
            @AuthenticationPrincipal UserPrincipal user,
            @RequestParam("file") MultipartFile file,
            @RequestParam(required = false) Long deckId) {
        if (file == null || file.isEmpty()) {
            throw com.examprep.services.contest.ContestRules.error(ResponseCode.BAD_REQUEST, "FILE_REQUIRED", "File is required");
        }
        if (file.getSize() > 10L * 1024 * 1024) {
            throw com.examprep.services.contest.ContestRules.error(ResponseCode.PAYLOAD_TOO_LARGE, "FILE_TOO_LARGE", "File size exceeds 10MB");
        }
        PreviewResponse resp = cardImportService.preview(user.getId(), file, deckId);
        return ResponseEntity.ok(ApiResponse.success(resp));
    }

    @PostMapping("/bulk")
    @Operation(summary = "API 30: Bulk save flashcards")
    public ResponseEntity<ApiResponse<BulkSaveResponse>> bulk(
            @AuthenticationPrincipal UserPrincipal user,
            @Valid @RequestBody BulkSaveRequest request) {
        BulkSaveResponse resp = cardImportService.bulk(user.getId(), request);
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(resp, "Đã lưu flashcard"));
    }
}
