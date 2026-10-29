package com.examprep.services.student;

import com.examprep.dto.ResponseCode;
import com.examprep.dto.student.StudentDeckDtos.CardWrite;
import com.examprep.entities.CardImport;
import com.examprep.entities.Deck;
import com.examprep.entities.Flashcard;
import com.examprep.exceptions.BadRequestException;
import com.examprep.exceptions.BaseException;
import com.examprep.exceptions.ForbiddenException;
import com.examprep.exceptions.ResourceNotFoundException;
import com.examprep.repositories.CardImportRepository;
import com.examprep.repositories.DeckRepository;
import com.examprep.repositories.FlashcardRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.multipart.MultipartFile;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.text.Normalizer;
import java.time.Duration;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * FC-07 / FC-11. The file is parsed in the request (5 MB, at most 2000 rows), the rows are inserted after
 * commit in chunks of 100, each chunk its own transaction, so FC-11 can show progress.
 */
@Slf4j
@Service
public class CardImportService {
    public static final long MAX_BYTES = 5L * 1024 * 1024;
    public static final int MAX_ROWS = 2000;
    private static final int CHUNK = 100;
    private static final List<String> COLUMNS = List.of("front", "back", "code_language", "code_body");
    private static final Duration STALE = Duration.ofMinutes(10);

    /** One data row; number is the row as the student sees it in the file (header = row 1). */
    record Row(int number, String front, String back, String language, String code) { }

    private final StudentDeckService decks;
    private final DeckRepository deckRepository;
    private final FlashcardRepository cards;
    private final CardImportRepository imports;
    private final ObjectMapper json;
    private final TransactionTemplate tx;
    // ponytail: parsed rows wait in memory until the background step runs; a restart loses them and the
    // import is reported FAILED after 10 minutes. Store rows in card_imports if imports must survive restarts.
    private final Map<Long, List<Row>> pending = new ConcurrentHashMap<>();
    private final ExecutorService worker = Executors.newFixedThreadPool(2, task -> {
        Thread thread = new Thread(task, "card-import");
        thread.setDaemon(true);
        return thread;
    });

    public CardImportService(StudentDeckService decks, DeckRepository deckRepository, FlashcardRepository cards,
                             CardImportRepository imports, ObjectMapper json, PlatformTransactionManager transactionManager) {
        this.decks = decks;
        this.deckRepository = deckRepository;
        this.cards = cards;
        this.imports = imports;
        this.json = json;
        this.tx = new TransactionTemplate(transactionManager);
    }

    public record Started(Long importId, String status, int totalRows) { }

    public record ErrorRow(int row, String reason) { }

    public record Status(Long importId, String status, int progress, int totalRows, int successCount, List<ErrorRow> errorRows) { }

    // ------------------------------------------------------------------ FC-07

    public Started start(Long userId, Long deckId, MultipartFile file) {
        if (file == null || file.isEmpty()) throw new BadRequestException("file is required.");
        if (file.getSize() > MAX_BYTES) {
            throw new BaseException(ResponseCode.PAYLOAD_TOO_LARGE, "The file is larger than 5 MB.", Map.of("code", "FILE_TOO_LARGE"));
        }
        byte[] bytes;
        try {
            bytes = file.getBytes();
        } catch (IOException ex) {
            throw unsupported();
        }
        List<Row> rows = parse(bytes);
        return tx.execute(status -> {
            decks.ownedDeck(userId, deckId);
            CardImport row = imports.save(CardImport.builder().userId(userId).deckId(deckId).totalRows(rows.size())
                    .fileName(fileName(file.getOriginalFilename())).build());
            Long id = row.getImportId();
            pending.put(id, rows);
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override public void afterCommit() { worker.execute(() -> process(id)); }
                @Override public void afterCompletion(int status) { if (status != STATUS_COMMITTED) pending.remove(id); }
            });
            return new Started(id, row.getStatus(), rows.size());
        });
    }

    /** Background step; also called directly by tests. */
    public void process(Long importId) {
        List<Row> rows = pending.remove(importId);
        try {
            if (rows == null) throw new IllegalStateException("rows lost");
            List<ErrorRow> errors = new ArrayList<>();
            int done = 0, saved = 0;
            for (int from = 0; from < rows.size(); from += CHUNK) {
                List<Row> chunk = rows.subList(from, Math.min(from + CHUNK, rows.size()));
                done += chunk.size();
                int progress = rows.isEmpty() ? 100 : done * 100 / rows.size();
                saved += tx.execute(status -> insertChunk(importId, chunk, errors, progress));
            }
            int successCount = saved;
            tx.executeWithoutResult(status -> imports.findById(importId).ifPresent(job -> {
                job.setStatus("COMPLETED");
                job.setProgress(100);
                job.setSuccessCount(successCount);
                job.setErrorRowsJson(write(errors));
                job.setCompletedAt(Instant.now());
            }));
        } catch (RuntimeException ex) {
            log.warn("Card import {} failed: {}", importId, ex.getClass().getSimpleName());
            tx.executeWithoutResult(status -> imports.findById(importId).ifPresent(job -> {
                job.setStatus("FAILED");
                job.setCompletedAt(Instant.now());
            }));
        }
    }

    private int insertChunk(Long importId, List<Row> chunk, List<ErrorRow> errors, int progress) {
        CardImport job = imports.findById(importId).orElseThrow();
        Deck deck = deckRepository.findForUpdate(job.getDeckId()).orElseThrow();
        int position = cards.maxPosition(deck.getDeckId());
        List<Flashcard> valid = new ArrayList<>();
        for (Row row : chunk) {
            Flashcard card = Flashcard.builder().deck(deck).build();
            try {
                StudentDeckService.apply(card, deck.getMode(), new CardWrite(row.front(), row.back(), row.language(), row.code()));
            } catch (BadRequestException ex) {
                errors.add(new ErrorRow(row.number(), ex.getMessage()));
                continue;
            }
            card.setPosition(++position);
            valid.add(card);
        }
        cards.saveAll(valid);
        job.setProgress(Math.min(progress, 99));
        job.setSuccessCount(job.getSuccessCount() + valid.size());
        return valid.size();
    }

    // ------------------------------------------------------------------ FC-11

    public Status status(Long userId, Long deckId, Long importId) {
        return tx.execute(s -> {
            Deck deck = deckRepository.findById(deckId).orElseThrow(() -> new ResourceNotFoundException("Deck not found."));
            if (!deck.getUser().getUserId().equals(userId)) throw new ForbiddenException("Only the owner can see this import.");
            CardImport job = imports.findById(importId).filter(j -> j.getDeckId().equals(deckId))
                    .orElseThrow(() -> new ResourceNotFoundException("Import not found."));
            if ("PROCESSING".equals(job.getStatus()) && !pending.containsKey(importId)
                    && job.getCreatedAt() != null && job.getCreatedAt().isBefore(Instant.now().minus(STALE))) {
                job.setStatus("FAILED");
                job.setCompletedAt(Instant.now());
            }
            List<ErrorRow> errors = "COMPLETED".equals(job.getStatus()) ? read(job.getErrorRowsJson()) : null;
            return new Status(job.getImportId(), job.getStatus(), job.getProgress(), job.getTotalRows(), job.getSuccessCount(), errors);
        });
    }

    // ------------------------------------------------------------------ parsing

    /** XLSX is recognised by its ZIP signature, CSV as strict UTF-8 text; the file name is never trusted. */
    List<Row> parse(byte[] bytes) {
        List<List<String>> table;
        if (bytes.length >= 4 && bytes[0] == 'P' && bytes[1] == 'K' && bytes[2] == 3 && bytes[3] == 4) {
            table = readXlsx(bytes);
        } else if (bytes.length >= 4 && bytes[0] == '%' && bytes[1] == 'P' && bytes[2] == 'D' && bytes[3] == 'F') {
            throw unsupported();
        } else {
            table = readCsv(text(bytes));
        }
        if (table.isEmpty()) throw new BadRequestException("The file has no header row.");
        List<String> header = table.get(0).stream().map(h -> clean(h).toLowerCase(Locale.ROOT)).toList();
        int[] at = COLUMNS.stream().mapToInt(header::indexOf).toArray();
        if (Arrays.stream(at).allMatch(i -> i < 0)) {
            throw new BadRequestException("The first row must name the columns: front, back, code_language, code_body.");
        }
        List<Row> rows = new ArrayList<>();
        for (int r = 1; r < table.size(); r++) {
            List<String> cells = table.get(r);
            if (cells.stream().allMatch(c -> clean(c).isEmpty())) continue;
            if (rows.size() == MAX_ROWS) throw new BadRequestException("A file may hold at most " + MAX_ROWS + " cards.");
            rows.add(new Row(r + 1, cell(cells, at[0]), cell(cells, at[1]), cell(cells, at[2]), cell(cells, at[3])));
        }
        if (rows.isEmpty()) throw new BadRequestException("The file has no cards.");
        return rows;
    }

    private static List<List<String>> readXlsx(byte[] bytes) {
        // POI's ZipSecureFile defaults (inflate ratio, entry size) guard against zip bombs.
        try (Workbook book = new XSSFWorkbook(new ByteArrayInputStream(bytes))) {
            Sheet sheet = book.getSheetAt(0);
            DataFormatter formatter = new DataFormatter();
            List<List<String>> table = new ArrayList<>();
            for (int r = 0; r <= sheet.getLastRowNum(); r++) {
                org.apache.poi.ss.usermodel.Row row = sheet.getRow(r);
                List<String> cells = new ArrayList<>();
                if (row != null && !row.getZeroHeight()) {
                    for (int c = 0; c < Math.max(0, row.getLastCellNum()); c++) cells.add(cellText(row.getCell(c), formatter));
                }
                table.add(cells);
            }
            return table;
        } catch (IOException | RuntimeException ex) {
            throw unsupported();
        }
    }

    /** Formula cells give their cached value; text that starts with "=" stays text. */
    private static String cellText(Cell cell, DataFormatter formatter) {
        if (cell == null) return "";
        CellType type = cell.getCellType() == CellType.FORMULA ? cell.getCachedFormulaResultType() : cell.getCellType();
        return switch (type) {
            case STRING -> cell.getStringCellValue();
            case BOOLEAN -> String.valueOf(cell.getBooleanCellValue());
            case NUMERIC -> cell.getCellType() == CellType.FORMULA
                    ? formatter.formatRawCellContents(cell.getNumericCellValue(), cell.getCellStyle().getDataFormat(), cell.getCellStyle().getDataFormatString())
                    : formatter.formatCellValue(cell);
            default -> "";
        };
    }

    private static String text(byte[] bytes) {
        for (byte b : bytes) if (b == 0) throw unsupported();
        try {
            String value = StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT)
                    .onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(bytes)).toString();
            return value.startsWith("﻿") ? value.substring(1) : value;
        } catch (CharacterCodingException ex) {
            throw unsupported();
        }
    }

    /** RFC 4180: quoted fields may hold commas, quotes ("") and line breaks. */
    static List<List<String>> readCsv(String text) {
        List<List<String>> table = new ArrayList<>();
        List<String> row = new ArrayList<>();
        StringBuilder field = new StringBuilder();
        boolean quoted = false;
        for (int i = 0; i < text.length(); i++) {
            char ch = text.charAt(i);
            if (quoted) {
                if (ch == '"' && i + 1 < text.length() && text.charAt(i + 1) == '"') { field.append('"'); i++; }
                else if (ch == '"') quoted = false;
                else field.append(ch);
            } else if (ch == '"' && field.isEmpty()) {
                quoted = true;
            } else if (ch == ',') {
                row.add(field.toString());
                field.setLength(0);
            } else if (ch == '\n' || ch == '\r') {
                if (ch == '\r' && i + 1 < text.length() && text.charAt(i + 1) == '\n') i++;
                row.add(field.toString());
                field.setLength(0);
                table.add(row);
                row = new ArrayList<>();
            } else {
                field.append(ch);
            }
        }
        if (!field.isEmpty() || !row.isEmpty()) {
            row.add(field.toString());
            table.add(row);
        }
        return table;
    }

    private static String cell(List<String> cells, int index) {
        if (index < 0 || index >= cells.size()) return null;
        String value = clean(cells.get(index));
        return value.isEmpty() ? null : value;
    }

    /** NFC (Vietnamese), control characters removed except line breaks and tabs. */
    private static String clean(String value) {
        if (value == null) return "";
        return Normalizer.normalize(value, Normalizer.Form.NFC).replaceAll("[\\p{Cc}&&[^\\n\\t]]", "").strip();
    }

    private static String fileName(String name) {
        if (name == null) return null;
        String base = name.replaceAll(".*[/\\\\]", "");
        return base.length() > 255 ? base.substring(0, 255) : base;
    }

    private static BaseException unsupported() {
        return new BaseException(ResponseCode.BAD_REQUEST, "Only CSV or XLSX files are supported.", Map.of("code", "UNSUPPORTED_FILE_TYPE"));
    }

    private String write(List<ErrorRow> errors) {
        try {
            return json.writeValueAsString(errors);
        } catch (IOException ex) {
            throw new IllegalStateException(ex);
        }
    }

    private List<ErrorRow> read(String value) {
        if (value == null) return List.of();
        try {
            return List.of(json.readValue(value, ErrorRow[].class));
        } catch (IOException ex) {
            return List.of();
        }
    }
}
