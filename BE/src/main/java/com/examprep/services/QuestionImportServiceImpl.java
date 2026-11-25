package com.examprep.services;

import com.examprep.dto.question.ImportBlockResult;
import com.examprep.dto.question.ImportPreviewResponse;
import com.examprep.entities.User;
import com.examprep.exceptions.BadRequestException;
import com.examprep.exceptions.ForbiddenException;
import com.examprep.util.importer.DocxTextExtractor;
import com.examprep.util.importer.ExcelQuestionParser;
import com.examprep.util.importer.PdfTextExtractor;
import com.examprep.util.importer.TemplateBlockParser;
import com.examprep.util.importer.TemplateQuestionMapper;
import com.examprep.repositories.CourseManagerRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import jakarta.annotation.PreDestroy;
import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.*;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

@Service
@RequiredArgsConstructor
public class QuestionImportServiceImpl implements QuestionImportService {

    private static final long MAX_IMPORT_BYTES = 10L * 1024 * 1024;
    private static final int MAX_RATE_REQUESTS = 10;
    private static final long RATE_WINDOW_MS = 60_000L;

    private final CourseManagerRepository courseManagerRepository;
    private final PdfTextExtractor pdfTextExtractor;
    private final DocxTextExtractor docxTextExtractor;
    private final ExcelQuestionParser excelQuestionParser;
    private final TemplateBlockParser templateBlockParser;
    private final TemplateQuestionMapper templateQuestionMapper;

    // Rate limiting tracker: userId -> bounded timestamps deque
    private final Map<Long, Deque<Long>> requestTimestamps = new ConcurrentHashMap<>();

    private final ExecutorService executor = new ThreadPoolExecutor(
            2, 8, 60L, TimeUnit.SECONDS,
            new LinkedBlockingQueue<>(32),
            r -> {
                Thread t = new Thread(r, "question-import");
                t.setDaemon(true);
                return t;
            },
            new ThreadPoolExecutor.AbortPolicy());

    @PreDestroy
    void shutdownExecutor() {
        executor.shutdownNow();
    }

    @Override
    public ImportPreviewResponse previewImport(MultipartFile file, Long courseId, Long moduleId, String difficulty, User user) throws Exception {
        if (user == null) {
            throw new ForbiddenException("Unauthorized");
        }
        if (courseId == null || !courseManagerRepository.existsByCourse_CourseIdAndUser_UserId(courseId, user.getUserId())) {
            throw new ForbiddenException("You do not have access to this course");
        }
        checkRateLimit(user.getUserId());

        if (file == null || file.isEmpty()) {
            throw new BadRequestException("File is required");
        }
        if (file.getSize() > MAX_IMPORT_BYTES) {
            throw new BadRequestException("File size must not exceed 10MB");
        }
        byte[] bytes = file.getBytes();
        String fileType = detectFileType(file.getOriginalFilename(), bytes);
        List<ImportBlockResult> blockResults;

        if ("XLSX".equals(fileType) || "XLS".equals(fileType)) {
            blockResults = executeWithTimeout(() -> excelQuestionParser.parseQuestions(bytes), 20);
            fileType = "XLSX";
        } else {
            List<String> lines = "PDF".equals(fileType)
                    ? executeWithTimeout(() -> pdfTextExtractor.extractText(file), 20)
                    : executeWithTimeout(() -> docxTextExtractor.extractText(file), 20);
            List<TemplateBlockParser.RawBlock> rawBlocks = templateBlockParser.parseBlocks(lines);
            blockResults = new ArrayList<>(rawBlocks.size());
            for (int i = 0; i < rawBlocks.size(); i++) {
                blockResults.add(templateQuestionMapper.mapAndValidateBlock(rawBlocks.get(i), i + 1));
            }
        }

        int validCount = 0;
        int errorCount = 0;
        for (ImportBlockResult res : blockResults) {
            if (res.getErrors() == null || res.getErrors().isEmpty()) {
                validCount++;
            } else {
                errorCount++;
            }
        }

        return ImportPreviewResponse.builder()
                .fileName(file.getOriginalFilename() != null ? file.getOriginalFilename() : "template")
                .fileType(fileType)
                .totalBlocks(blockResults.size())
                .totalValid(validCount)
                .totalErrors(errorCount)
                .blocks(blockResults)
                .build();
    }

    private String detectFileType(String originalFilename, byte[] bytes) {
        String lowerName = originalFilename != null ? originalFilename.toLowerCase(Locale.ROOT) : "";
        boolean isPdfMagic = bytes.length >= 5 && "%PDF-".equals(new String(bytes, 0, 5, StandardCharsets.US_ASCII));
        boolean isZipMagic = bytes.length >= 4 && bytes[0] == 0x50 && bytes[1] == 0x4B && bytes[2] == 0x03 && bytes[3] == 0x04;
        boolean isOle2Magic = bytes.length >= 4
                && (bytes[0] & 0xFF) == 0xD0 && (bytes[1] & 0xFF) == 0xCF
                && (bytes[2] & 0xFF) == 0x11 && (bytes[3] & 0xFF) == 0xE0;

        if (isPdfMagic) {
            return "PDF";
        }
        if (isZipMagic) {
            try (ZipInputStream zis = new ZipInputStream(new ByteArrayInputStream(bytes))) {
                ZipEntry entry;
                while ((entry = zis.getNextEntry()) != null) {
                    String name = entry.getName().toLowerCase(Locale.ROOT);
                    if (name.startsWith("xl/")) return "XLSX";
                    if (name.startsWith("word/")) return "DOCX";
                }
            } catch (Exception ignored) {
                // Fall back to extension below
            }
            if (lowerName.endsWith(".xlsx")) return "XLSX";
            if (lowerName.endsWith(".docx")) return "DOCX";
            throw new BadRequestException("Unsupported file format. Supported: .pdf, .docx, .xlsx, .xls");
        }
        if (isOle2Magic || lowerName.endsWith(".xls")) {
            return "XLS";
        }
        if (lowerName.endsWith(".xlsx")) {
            return "XLSX";
        }
        if (lowerName.endsWith(".docx")) {
            return "DOCX";
        }
        throw new BadRequestException("Unsupported file format. Supported: .pdf, .docx, .xlsx, .xls");
    }

    @Override
    public ResponseEntity<Resource> downloadTemplate(String format) throws Exception {
        if (format == null) {
            throw new BadRequestException("Format parameter is required");
        }
        String lowerFormat = format.toLowerCase(Locale.ROOT).trim();
        Resource resource;
        String filename;
        MediaType mediaType;

        if ("pdf".equals(lowerFormat)) {
            resource = new ClassPathResource("templates/import/apepp-question-template-v2.pdf");
            filename = "apepp-question-template-v2.pdf";
            mediaType = MediaType.APPLICATION_PDF;
        } else if ("docx".equals(lowerFormat)) {
            resource = new ClassPathResource("templates/import/apepp-question-template-v2.docx");
            filename = "apepp-question-template-v2.docx";
            mediaType = MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
        } else if ("xlsx".equals(lowerFormat) || "excel".equals(lowerFormat)) {
            resource = new ClassPathResource("templates/import/apepp-question-template-v2.xlsx");
            filename = "apepp-question-template-v2.xlsx";
            mediaType = MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        } else {
            throw new BadRequestException("Invalid template format. Supported: pdf, docx, xlsx");
        }

        if (!resource.exists()) {
            throw new BadRequestException("Template file not found on server");
        }

        return ResponseEntity.ok()
                .contentType(mediaType)
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + filename + "\"")
                .body(resource);
    }

    private <T> T executeWithTimeout(Callable<T> task, long timeoutSeconds) throws Exception {
        Future<T> future;
        try {
            future = executor.submit(task);
        } catch (RejectedExecutionException ex) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "Import queue is busy, please try again shortly");
        }
        try {
            return future.get(timeoutSeconds, TimeUnit.SECONDS);
        } catch (TimeoutException e) {
            future.cancel(true);
            throw new ResponseStatusException(HttpStatus.GATEWAY_TIMEOUT, "Import processing timed out");
        } catch (ExecutionException e) {
            Throwable cause = e.getCause();
            if (cause instanceof Exception) {
                throw (Exception) cause;
            }
            throw new RuntimeException(cause);
        }
    }

    private void checkRateLimit(Long userId) {
        long now = System.currentTimeMillis();
        Deque<Long> timestamps = requestTimestamps.computeIfAbsent(userId, k -> new ArrayDeque<>());
        synchronized (timestamps) {
            while (!timestamps.isEmpty() && now - timestamps.peekFirst() > RATE_WINDOW_MS) {
                timestamps.pollFirst();
            }
            if (timestamps.size() >= MAX_RATE_REQUESTS) {
                throw new BadRequestException("Rate limit exceeded: maximum 10 import requests per minute");
            }
            timestamps.addLast(now);
        }
        if (requestTimestamps.size() > 10_000) {
            requestTimestamps.entrySet().removeIf(e -> {
                synchronized (e.getValue()) {
                    return e.getValue().isEmpty() || now - e.getValue().peekLast() > RATE_WINDOW_MS;
                }
            });
        }
    }
}
