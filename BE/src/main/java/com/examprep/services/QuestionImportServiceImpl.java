package com.examprep.services;

import com.examprep.dto.question.ImportBlockResult;
import com.examprep.dto.question.ImportPreviewResponse;
import com.examprep.entities.User;
import com.examprep.exceptions.BadRequestException;
import com.examprep.exceptions.ForbiddenException;
import com.examprep.util.importer.DocxTextExtractor;
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

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.*;

@Service
@RequiredArgsConstructor
public class QuestionImportServiceImpl implements QuestionImportService {

    private final CourseManagerRepository courseManagerRepository;
    private final PdfTextExtractor pdfTextExtractor;
    private final DocxTextExtractor docxTextExtractor;
    private final TemplateBlockParser templateBlockParser;
    private final TemplateQuestionMapper templateQuestionMapper;

    // Rate limiting tracker: userId -> list of timestamps
    private final Map<Long, List<Long>> requestTimestamps = new ConcurrentHashMap<>();

    private static final ExecutorService executor = Executors.newCachedThreadPool();

    @Override
    public ImportPreviewResponse previewImport(MultipartFile file, Long courseId, Long moduleId, String difficulty, User user) throws Exception {
        if (user == null) {
            throw new ForbiddenException("Unauthorized");
        }
        if (!User.ROLE_ADMIN.equals(user.getRoleName())) {
            if (courseId == null || !courseManagerRepository.existsByCourse_CourseIdAndUser_UserId(courseId, user.getUserId())) {
                throw new ForbiddenException("You do not have access to this course");
            }
        }
        checkRateLimit(user.getUserId());

        if (file == null || file.isEmpty()) {
            throw new BadRequestException("File is required");
        }
        byte[] bytes = file.getBytes();
        String fileType;
        List<String> lines;

        if (bytes.length >= 5 && new String(bytes, 0, 5, StandardCharsets.US_ASCII).equals("%PDF-")) {
            fileType = "PDF";
            lines = executeWithTimeout(() -> pdfTextExtractor.extractText(file), 20);
        } else {
            fileType = "DOCX";
            lines = executeWithTimeout(() -> docxTextExtractor.extractText(file), 20);
        }

        List<TemplateBlockParser.RawBlock> rawBlocks = templateBlockParser.parseBlocks(lines);

        List<ImportBlockResult> blockResults = new ArrayList<>();
        int validCount = 0;
        int errorCount = 0;

        for (int i = 0; i < rawBlocks.size(); i++) {
            ImportBlockResult res = templateQuestionMapper.mapAndValidateBlock(rawBlocks.get(i), i + 1, difficulty != null ? difficulty : "MEDIUM");
            blockResults.add(res);
            if (res.getErrors() == null || res.getErrors().isEmpty()) {
                validCount++;
            } else {
                errorCount++;
            }
        }

        return ImportPreviewResponse.builder()
                .fileName(file.getOriginalFilename() != null ? file.getOriginalFilename() : "template")
                .fileType(fileType)
                .totalBlocks(rawBlocks.size())
                .totalValid(validCount)
                .totalErrors(errorCount)
                .blocks(blockResults)
                .build();
    }

    @Override
    public ResponseEntity<Resource> downloadTemplate(String format) throws Exception {
        if (format == null) {
            throw new BadRequestException("Format parameter is required");
        }
        String lowerFormat = format.toLowerCase().trim();
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
        } else {
            throw new BadRequestException("Invalid template format. Supported: pdf, docx");
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
        Future<T> future = executor.submit(task);
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
        List<Long> timestamps = requestTimestamps.computeIfAbsent(userId, k -> new CopyOnWriteArrayList<>());
        timestamps.removeIf(t -> now - t > 60000); // 1 minute window
        if (timestamps.size() >= 10) {
            throw new BadRequestException("Rate limit exceeded: maximum 10 import requests per minute");
        }
        timestamps.add(now);
    }
}
