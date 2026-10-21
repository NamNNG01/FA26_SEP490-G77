package com.examprep.util.importer;

import com.examprep.exceptions.BadRequestException;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;

import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.List;
import java.util.stream.Collectors;

@Component
public class PdfTextExtractor implements DocumentTextExtractor {

    private static final long MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

    @Override
    public List<String> extractText(MultipartFile file) throws Exception {
        if (file == null || file.isEmpty()) {
            throw new BadRequestException("File is required");
        }
        if (file.getSize() > MAX_FILE_SIZE) {
            throw new BadRequestException("File size exceeds maximum limit of 10 MB");
        }

        byte[] bytes = file.getBytes();
        if (bytes.length < 5 || !new String(bytes, 0, 5, StandardCharsets.US_ASCII).equals("%PDF-")) {
            throw new BadRequestException("Invalid PDF file format");
        }

        try (PDDocument document = Loader.loadPDF(bytes)) {
            if (document.isEncrypted()) {
                throw new BadRequestException("PDF is encrypted or password-protected");
            }
            if (document.getNumberOfPages() > 100) {
                throw new BadRequestException("PDF exceeds maximum allowed 100 pages");
            }

            PDFTextStripper stripper = new PDFTextStripper();
            String rawText = stripper.getText(document);
            if (rawText == null || rawText.trim().isEmpty()) {
                throw new BadRequestException("PDF has no text layer (image scan)");
            }

            return Arrays.stream(rawText.split("\\r?\\n"))
                    .map(this::normalizeLine)
                    .collect(Collectors.toList());
        } catch (BadRequestException e) {
            throw e;
        } catch (Exception e) {
            throw new BadRequestException("Failed to parse PDF file: " + e.getMessage());
        }
    }

    private String normalizeLine(String line) {
        if (line == null) return "";
        // Normalize unicode whitespace, nbsp, dashes
        String normalized = line.replace(' ', ' ')
                .replace('–', '-')
                .replace('—', '-')
                .replace('“', '"')
                .replace('”', '"')
                .replace('‘', '\'')
                .replace('’', '\'')
                .trim()
                .replaceAll("\\s+", " ");

        // Normalize underscores: 3 or more underscores -> ____
        normalized = normalized.replaceAll("_{3,}", "____");
        return normalized;
    }
}
