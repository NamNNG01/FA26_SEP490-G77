package com.examprep.util.importer;

import com.examprep.exceptions.BadRequestException;
import org.apache.poi.xwpf.usermodel.IBodyElement;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.apache.poi.xwpf.usermodel.XWPFParagraph;
import org.apache.poi.xwpf.usermodel.XWPFTable;
import org.apache.poi.xwpf.usermodel.XWPFTableCell;
import org.apache.poi.xwpf.usermodel.XWPFTableRow;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

@Component
public class DocxTextExtractor implements DocumentTextExtractor {

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

        // Zip bomb & structure validation
        validateZipStructureAndBomb(bytes);

        try (InputStream is = new ByteArrayInputStream(bytes);
             XWPFDocument doc = new XWPFDocument(is)) {

            List<String> lines = new ArrayList<>();
            int[] paragraphCount = {0};
            for (IBodyElement element : doc.getBodyElements()) {
                collectElementLines(element, lines, paragraphCount);
            }
            if (paragraphCount[0] > 5000) {
                throw new BadRequestException("DOCX exceeds maximum allowed 5000 paragraphs");
            }

            return lines;
        } catch (BadRequestException e) {
            throw e;
        } catch (Exception e) {
            throw new BadRequestException("Failed to parse DOCX file: " + e.getMessage());
        }
    }

    private void validateZipStructureAndBomb(byte[] bytes) throws Exception {
        boolean hasContentTypes = false;
        boolean hasDocumentXml = false;
        int entryCount = 0;
        long totalUncompressedSize = 0;
        long totalCompressedSize = bytes.length;

        try (ZipInputStream zis = new ZipInputStream(new ByteArrayInputStream(bytes))) {
            ZipEntry entry;
            while ((entry = zis.getNextEntry()) != null) {
                entryCount++;
                if (entryCount > 500) {
                    throw new BadRequestException("DOCX entry count exceeds zip bomb safety limit (500)");
                }

                String name = entry.getName();
                if ("[Content_Types].xml".equals(name)) {
                    hasContentTypes = true;
                }
                if ("word/document.xml".equals(name)) {
                    hasDocumentXml = true;
                }

                long size = entry.getSize();
                if (size > 50L * 1024 * 1024) {
                    throw new BadRequestException("DOCX uncompressed entry size exceeds limit");
                }
                byte[] buf = new byte[8192];
                int read;
                long entrySize = 0;
                while ((read = zis.read(buf)) != -1) {
                    entrySize += read;
                    totalUncompressedSize += read;
                    if (entrySize > 50L * 1024 * 1024) {
                        throw new BadRequestException("DOCX uncompressed entry size exceeds limit");
                    }
                    if (totalUncompressedSize > 50L * 1024 * 1024) {
                        throw new BadRequestException("DOCX total uncompressed size exceeds 50 MB (zip bomb protection)");
                    }
                }
            }
        } catch (BadRequestException e) {
            throw e;
        } catch (Exception e) {
            throw new BadRequestException("Invalid DOCX/ZIP file structure or zip bomb detected");
        }

        if (!hasContentTypes || !hasDocumentXml) {
            throw new BadRequestException("Invalid DOCX file structure ([Content_Types].xml or word/document.xml missing)");
        }

        if (totalUncompressedSize > 50 * 1024 * 1024) {
            throw new BadRequestException("DOCX total uncompressed size exceeds 50 MB (zip bomb protection)");
        }

        if (totalCompressedSize > 0 && (double) totalUncompressedSize / totalCompressedSize > 100.0) {
            throw new BadRequestException("DOCX compression ratio exceeds 100:1 (zip bomb protection)");
        }
    }

    private void collectElementLines(IBodyElement element, List<String> lines, int[] paragraphCount) {
        if (element instanceof XWPFParagraph p) {
            paragraphCount[0]++;
            if (paragraphCount[0] > 5000) {
                throw new BadRequestException("DOCX exceeds maximum allowed 5000 paragraphs");
            }
            String text = p.getText();
            if (text != null) {
                lines.add(normalizeLine(text));
            }
        } else if (element instanceof XWPFTable table) {
            for (XWPFTableRow row : table.getRows()) {
                for (XWPFTableCell cell : row.getTableCells()) {
                    for (IBodyElement cellElement : cell.getBodyElements()) {
                        collectElementLines(cellElement, lines, paragraphCount);
                    }
                }
            }
        }
    }

    private String normalizeLine(String line) {
        if (line == null) return "";
        String normalized = line.replace(' ', ' ')
                .replace('–', '-')
                .replace('—', '-')
                .replace('“', '"')
                .replace('”', '"')
                .replace('‘', '\'')
                .replace('’', '\'')
                .trim();

        if (normalized.startsWith("CODE_CONFIG:")
                || normalized.startsWith("TEST_CASE:")) {
            return normalized;
        }

        normalized = normalized.replaceAll("\\s+", " ");
        normalized = normalized.replaceAll("_{3,}", "____");
        return normalized;
    }
}
