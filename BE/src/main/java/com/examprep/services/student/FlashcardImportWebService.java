package com.examprep.services.student;

import com.examprep.dto.FlashcardImportDtos.*;
import com.examprep.dto.ResponseCode;
import com.examprep.entities.*;
import com.examprep.exceptions.BaseException;
import com.examprep.repositories.*;
import com.examprep.services.contest.ContestRules;
import lombok.RequiredArgsConstructor;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.text.PDFTextStripper;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.apache.poi.xwpf.usermodel.XWPFTable;
import org.apache.poi.xwpf.usermodel.XWPFTableRow;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.text.Normalizer;
import java.time.Instant;
import java.util.*;

@Service
@RequiredArgsConstructor
@Transactional
public class FlashcardImportWebService {

    private final DeckRepository deckRepository;
    private final FlashcardRepository flashcardRepository;
    private final CourseRepository courseRepository;
    private final CourseManagerRepository courseManagerRepository;
    private final AiUsageLogRepository aiUsageLogRepository;

    @Transactional(readOnly = true)
    public PreviewResponse preview(Long userId, MultipartFile file, Long deckId) {
        String filename = file.getOriginalFilename() != null ? file.getOriginalFilename().toLowerCase() : "";
        byte[] bytes;
        try {
            bytes = file.getBytes();
        } catch (IOException e) {
            throw new BaseException(ResponseCode.BAD_REQUEST, "Failed to read file", Map.of("code", "FILE_CORRUPTED"));
        }

        String fileType = "UNKNOWN";
        List<ParsedRow> parsedRows = new ArrayList<>();
        String templateVersion = "V1";
        List<PreviewWarning> warnings = new ArrayList<>();

        if (filename.endsWith(".xlsx") || (bytes.length >= 4 && bytes[0] == 'P' && bytes[1] == 'K')) {
            fileType = "XLSX";
            parsedRows = parseXlsx(bytes, warnings);
        } else if (filename.endsWith(".docx") || (bytes.length >= 4 && bytes[0] == 'P' && bytes[1] == 'K')) {
            fileType = "DOCX";
            parsedRows = parseDocx(bytes, templateVersion, warnings);
        } else if (filename.endsWith(".pdf") || (bytes.length >= 4 && bytes[0] == '%' && bytes[1] == 'P')) {
            fileType = "PDF";
            parsedRows = parsePdf(bytes, warnings);
        } else {
            throw new BaseException(ResponseCode.BAD_REQUEST, "Unsupported file type", Map.of("code", "UNSUPPORTED_FILE_TYPE"));
        }

        if (parsedRows.size() > 500) {
            throw new BaseException(ResponseCode.BAD_REQUEST, "File has more than 500 rows", Map.of("code", "TOO_MANY_ROWS"));
        }

        Set<String> deckCards = new HashSet<>();
        if (deckId != null) {
            deckRepository.findById(deckId).ifPresent(d -> {
                flashcardRepository.findByDeckDeckIdOrderByCardIdAsc(deckId).forEach(c -> {
                    String f = normalize(c.getFrontText());
                    String b = normalize(c.getBackText());
                    deckCards.add(f + "|||" + b);
                });
            });
        }

        Set<String> fileSeen = new HashSet<>();
        List<PreviewCardDto> cards = new ArrayList<>();
        int validCount = 0;
        int invalidCount = 0;
        int duplicateCount = 0;

        for (ParsedRow r : parsedRows) {
            List<ValidationError> errors = new ArrayList<>();
            String front = r.front != null ? r.front.trim() : "";
            String back = r.back != null ? r.back.trim() : "";

            if (front.isEmpty()) {
                errors.add(new ValidationError("FRONT_EMPTY", "Mặt trước đang trống"));
            } else if (front.length() > 2000) {
                errors.add(new ValidationError("FRONT_TOO_LONG", "Mặt trước vượt quá 2000 ký tự"));
            }

            if (back.isEmpty()) {
                errors.add(new ValidationError("BACK_EMPTY", "Mặt sau đang trống"));
            } else if (back.length() > 2000) {
                errors.add(new ValidationError("BACK_TOO_LONG", "Mặt sau vượt quá 2000 ký tự"));
            }

            boolean duplicate = false;
            if (errors.isEmpty()) {
                String key = normalize(front) + "|||" + normalize(back);
                if (fileSeen.contains(key) || deckCards.contains(key)) {
                    duplicate = true;
                    duplicateCount++;
                    errors.add(new ValidationError("DUPLICATE_IN_FILE", "Thẻ bị trùng lặp"));
                } else {
                    fileSeen.add(key);
                }
            }

            boolean valid = errors.isEmpty();
            if (valid) validCount++;
            else invalidCount++;

            cards.add(new PreviewCardDto(r.rowIndex, r.front, r.back, valid, duplicate, errors));
        }

        return new PreviewResponse(
                file.getOriginalFilename(),
                fileType,
                templateVersion,
                parsedRows.size(),
                validCount,
                invalidCount,
                duplicateCount,
                cards,
                warnings
        );
    }

    public BulkSaveResponse bulk(Long userId, BulkSaveRequest req) {
        Deck deck = null;
        if (req.deckId() != null) {
            deck = deckRepository.findById(req.deckId())
                    .orElseThrow(() -> new BaseException(ResponseCode.RESOURCE_NOT_FOUND, "Deck not found", Map.of("code", "DECK_NOT_FOUND")));

            boolean isOwner = deck.getUser() != null && deck.getUser().getUserId().equals(userId);
            boolean isManager = deck.getCourse() != null && courseManagerRepository.existsByCourse_CourseIdAndUser_UserId(deck.getCourse().getCourseId(), userId);
            if (!isOwner && !isManager) {
                throw new BaseException(ResponseCode.FORBIDDEN, "Not authorized", Map.of("code", "FORBIDDEN_DECK"));
            }
        } else if (req.newDeck() != null) {
            var nd = req.newDeck();
            if (nd.courseId() != null) {
                boolean isManager = courseManagerRepository.existsByCourse_CourseIdAndUser_UserId(nd.courseId(), userId);
                if (!isManager) {
                    throw new BaseException(ResponseCode.FORBIDDEN, "Not manager", Map.of("code", "FORBIDDEN_COURSE"));
                }
                Course c = courseRepository.findById(nd.courseId()).orElseThrow(() -> new BaseException(ResponseCode.RESOURCE_NOT_FOUND, "Course not found", Map.of("code", "COURSE_NOT_FOUND")));
                deck = Deck.builder().user(User.builder().userId(userId).build()).course(c).title(nd.title()).description(nd.description()).isPublic(Boolean.TRUE.equals(nd.isPublic())).build();
            } else {
                deck = Deck.builder().user(User.builder().userId(userId).build()).title(nd.title()).description(nd.description()).isPublic(Boolean.TRUE.equals(nd.isPublic())).build();
            }
            deck = deckRepository.save(deck);
        } else {
            throw new BaseException(ResponseCode.BAD_REQUEST, "deckId or newDeck required", Map.of("code", "VALIDATION_FAILED"));
        }

        if ("AI".equalsIgnoreCase(req.source())) {
            if (req.aiGenerationId() != null) {
                aiUsageLogRepository.findById(req.aiGenerationId()).ifPresent(log -> {
                    log.setSavedAt(Instant.now());
                    aiUsageLogRepository.save(log);
                });
            }
        }

        if (req.cards() == null || req.cards().isEmpty()) {
            throw new BaseException(ResponseCode.BAD_REQUEST, "Cards required", Map.of("code", "VALIDATION_FAILED"));
        }
        if (req.cards().size() > 500) {
            throw new BaseException(ResponseCode.BAD_REQUEST, "Too many cards", Map.of("code", "BATCH_TOO_LARGE"));
        }

        boolean skipDup = req.skipDuplicates() == null || req.skipDuplicates();
        Set<String> existingKeys = new HashSet<>();
        flashcardRepository.findByDeckDeckIdOrderByCardIdAsc(deck.getDeckId()).forEach(c -> existingKeys.add(normalize(c.getFrontText()) + "|||" + normalize(c.getBackText())));

        int position = flashcardRepository.maxPosition(deck.getDeckId());
        List<Flashcard> toSave = new ArrayList<>();
        int skipped = 0;
        List<Long> cardIds = new ArrayList<>();

        for (var ci : req.cards()) {
            String front = ci.frontText() != null ? ci.frontText().trim() : "";
            String back = ci.backText() != null ? ci.backText().trim() : "";
            if (front.isEmpty() || back.isEmpty()) continue;

            String key = normalize(front) + "|||" + normalize(back);
            if (skipDup && existingKeys.contains(key)) {
                skipped++;
                continue;
            }
            existingKeys.add(key);
            Flashcard fc = Flashcard.builder()
                    .deck(deck)
                    .frontText(front)
                    .backText(back)
                    .position(++position)
                    .build();
            toSave.add(fc);
        }

        List<Flashcard> saved = flashcardRepository.saveAll(toSave);
        saved.forEach(s -> cardIds.add(s.getCardId()));

        return new BulkSaveResponse(deck.getDeckId(), saved.size(), skipped, cardIds);
    }

    record ParsedRow(int rowIndex, String front, String back) {}

    private List<ParsedRow> parseXlsx(byte[] bytes, List<PreviewWarning> warnings) {
        List<ParsedRow> rows = new ArrayList<>();
        try (Workbook book = new XSSFWorkbook(new ByteArrayInputStream(bytes))) {
            Sheet sheet = book.getSheet("Flashcards");
            if (sheet == null) sheet = book.getSheetAt(0);

            int ignored = 0;
            for (int i = 1; i <= sheet.getLastRowNum(); i++) {
                Row r = sheet.getRow(i);
                if (r == null) { ignored++; continue; }
                String front = getCellStr(r.getCell(1));
                String back = getCellStr(r.getCell(2));
                if (front.isBlank() && back.isBlank()) {
                    ignored++;
                    continue;
                }
                rows.add(new ParsedRow(i + 1, front, back));
            }
            if (ignored > 0) {
                warnings.add(new PreviewWarning("ROWS_IGNORED", "Bỏ qua " + ignored + " dòng trống"));
            }
        } catch (IOException e) {
            throw new BaseException(ResponseCode.BAD_REQUEST, "Invalid Excel", Map.of("code", "FILE_CORRUPTED"));
        }
        return rows;
    }

    private List<ParsedRow> parseDocx(byte[] bytes, String templateVersion, List<PreviewWarning> warnings) {
        List<ParsedRow> rows = new ArrayList<>();
        try (XWPFDocument doc = new XWPFDocument(new ByteArrayInputStream(bytes))) {
            if (!doc.getParagraphs().isEmpty() && doc.getParagraphs().get(0).getText().contains("TEMPLATE=FLASHCARD_V1")) {
                templateVersion = "V1";
            }
            List<XWPFTable> tables = doc.getTables();
            if (tables.isEmpty()) {
                throw new BaseException(ResponseCode.BAD_REQUEST, "No table", Map.of("code", "TEMPLATE_INVALID"));
            }
            XWPFTable table = tables.get(0);
            int ignored = 0;
            for (int i = 1; i < table.getNumberOfRows(); i++) {
                XWPFTableRow r = table.getRow(i);
                if (r.getTableCells().size() < 3) continue;
                String front = r.getCell(1).getText();
                String back = r.getCell(2).getText();
                if (front.isBlank() && back.isBlank()) {
                    ignored++;
                    continue;
                }
                rows.add(new ParsedRow(i + 1, front, back));
            }
            if (ignored > 0) {
                warnings.add(new PreviewWarning("ROWS_IGNORED", "Bỏ qua " + ignored + " dòng trống"));
            }
        } catch (IOException e) {
            throw new BaseException(ResponseCode.BAD_REQUEST, "Invalid Word", Map.of("code", "FILE_CORRUPTED"));
        }
        return rows;
    }

    private List<ParsedRow> parsePdf(byte[] bytes, List<PreviewWarning> warnings) {
        List<ParsedRow> rows = new ArrayList<>();
        try (var doc = Loader.loadPDF(bytes)) {
            PDFTextStripper stripper = new PDFTextStripper();
            String text = stripper.getText(doc);
            if (text == null || text.isBlank()) {
                throw new BaseException(ResponseCode.BAD_REQUEST, "No text layer", Map.of("code", "PDF_NO_TEXT_LAYER"));
            }
            String[] lines = text.split("\\r?\\n");
            int ignored = 0;
            int idx = 1;
            for (String line : lines) {
                String trimmed = line.trim();
                if (trimmed.isEmpty()) { ignored++; continue; }
                String[] parts = trimmed.split("\\t|\\s{2,}");
                if (parts.length >= 2) {
                    rows.add(new ParsedRow(++idx, parts[0], parts[1]));
                }
            }
        } catch (IOException e) {
            throw new BaseException(ResponseCode.BAD_REQUEST, "Invalid PDF", Map.of("code", "FILE_CORRUPTED"));
        }
        return rows;
    }

    private String getCellStr(Cell cell) {
        if (cell == null) return "";
        DataFormatter fmt = new DataFormatter();
        return fmt.formatCellValue(cell);
    }

    private String normalize(String s) {
        if (s == null) return "";
        return Normalizer.normalize(s.trim().toLowerCase(Locale.ROOT), Normalizer.Form.NFC);
    }
}
