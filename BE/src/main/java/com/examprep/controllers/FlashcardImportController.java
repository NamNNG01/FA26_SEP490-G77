package com.examprep.controllers;

import com.examprep.dto.ApiResponse;
import com.examprep.dto.ResponseCode;
import com.examprep.dto.FlashcardImportDtos.*;
import com.examprep.security.UserPrincipal;
import com.examprep.services.student.FlashcardImportWebService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.ByteArrayOutputStream;
import java.io.IOException;

@RestController
@RequestMapping("/api/v1/flashcards")
@RequiredArgsConstructor
@Tag(name = "Flashcard Import")
public class FlashcardImportController {

    private final FlashcardImportWebService service;

    @GetMapping("/import/template")
    @Operation(summary = "API 28: Download Flashcard Template (docx/xlsx)")
    public ResponseEntity<ByteArrayResource> template(@RequestParam(defaultValue = "docx") String format) {
        try {
            if ("xlsx".equalsIgnoreCase(format)) {
                try (org.apache.poi.ss.usermodel.Workbook book = new org.apache.poi.xssf.usermodel.XSSFWorkbook()) {
                    org.apache.poi.ss.usermodel.Sheet meta = book.createSheet("_meta");
                    meta.createRow(0).createCell(0).setCellValue("FLASHCARD_TEMPLATE_V1");

                    org.apache.poi.ss.usermodel.Sheet guide = book.createSheet("Hướng dẫn");
                    guide.createRow(0).createCell(0).setCellValue("Hướng dẫn sử dụng: Tối đa 500 dòng, mỗi mặt tối đa 2000 ký tự.");

                    org.apache.poi.ss.usermodel.Sheet sheet = book.createSheet("Flashcards");
                    org.apache.poi.ss.usermodel.Row header = sheet.createRow(0);
                    header.createCell(0).setCellValue("STT");
                    header.createCell(1).setCellValue("Mặt trước");
                    header.createCell(2).setCellValue("Mặt sau");

                    org.apache.poi.ss.usermodel.Row r1 = sheet.createRow(1);
                    r1.createCell(0).setCellValue(1);
                    r1.createCell(1).setCellValue("Photosynthesis");
                    r1.createCell(2).setCellValue("Quang hợp");

                    ByteArrayOutputStream out = new ByteArrayOutputStream();
                    book.write(out);
                    ByteArrayResource resource = new ByteArrayResource(out.toByteArray());
                    return ResponseEntity.ok()
                            .contentType(MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
                            .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"flashcard-import-template-v1.xlsx\"")
                            .body(resource);
                }
            } else {
                try (org.apache.poi.xwpf.usermodel.XWPFDocument doc = new org.apache.poi.xwpf.usermodel.XWPFDocument()) {
                    var p1 = doc.createParagraph();
                    p1.createRun().setText("TEMPLATE=FLASHCARD_V1 - Hướng dẫn sử dụng: Tối đa 500 dòng, mỗi mặt tối đa 2000 ký tự.");

                    org.apache.poi.xwpf.usermodel.XWPFTable table = doc.createTable(2, 3);
                    var hRow = table.getRow(0);
                    hRow.getCell(0).setText("STT");
                    hRow.getCell(1).setText("Mặt trước");
                    hRow.getCell(2).setText("Mặt sau");

                    var dRow = table.getRow(1);
                    dRow.getCell(0).setText("1");
                    dRow.getCell(1).setText("Photosynthesis");
                    dRow.getCell(2).setText("Quang hợp");

                    ByteArrayOutputStream out = new ByteArrayOutputStream();
                    doc.write(out);
                    ByteArrayResource resource = new ByteArrayResource(out.toByteArray());
                    return ResponseEntity.ok()
                            .contentType(MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.wordprocessingml.document"))
                            .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"flashcard-import-template-v1.docx\"")
                            .body(resource);
                }
            }
        } catch (IOException e) {
            throw new RuntimeException("Failed to generate template", e);
        }
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
        PreviewResponse resp = service.preview(user.getId(), file, deckId);
        return ResponseEntity.ok(ApiResponse.success(resp));
    }

    @PostMapping("/bulk")
    @Operation(summary = "API 30: Bulk save flashcards")
    public ResponseEntity<ApiResponse<BulkSaveResponse>> bulk(
            @AuthenticationPrincipal UserPrincipal user,
            @Valid @RequestBody BulkSaveRequest request) {
        BulkSaveResponse resp = service.bulk(user.getId(), request);
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(resp, "Đã lưu flashcard"));
    }
}
