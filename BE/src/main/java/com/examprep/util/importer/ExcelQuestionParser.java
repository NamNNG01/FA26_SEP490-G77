package com.examprep.util.importer;

import com.examprep.dto.question.ImportBlockResult;
import com.examprep.dto.question.ImportErrorDto;
import com.examprep.exceptions.BadRequestException;
import lombok.RequiredArgsConstructor;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellType;
import org.apache.poi.ss.usermodel.DataFormatter;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.ss.usermodel.WorkbookFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Component
@RequiredArgsConstructor
public class ExcelQuestionParser {

    public static final int MAX_QUESTIONS = 500;
    private static final int MAX_COLUMNS = 32;
    private static final int MAX_SCAN_ROWS = 5000;
    private static final Pattern NUMBERED_RIGHT_ITEM = Pattern.compile("^(\\d+)[\\.)]\\s+(.+)$");
    private static final Pattern OPTION_COLUMN_HEADER = Pattern.compile("^option([a-z])$");

    private final ImportedQuestionAssembler assembler;

    public List<ImportBlockResult> parseQuestions(MultipartFile file) throws Exception {
        byte[] bytes = file.getBytes();
        return parseQuestions(bytes);
    }

    public List<ImportBlockResult> parseQuestions(byte[] bytes) {
        if (bytes == null || bytes.length == 0) {
            throw new BadRequestException("Excel file is empty");
        }

        try (Workbook workbook = WorkbookFactory.create(new ByteArrayInputStream(bytes))) {
            Sheet sheet = resolveQuestionsSheet(workbook);
            if (sheet == null) {
                throw new BadRequestException("Excel workbook has no readable sheet");
            }
            if (sheet.getLastRowNum() > MAX_SCAN_ROWS) {
                throw new BadRequestException("Excel sheet has too many rows (max " + MAX_SCAN_ROWS + " rows scanned)");
            }

            DataFormatter formatter = new DataFormatter();
            int headerRowIdx = findHeaderRowIndex(sheet);
            if (headerRowIdx < 0) {
                throw new BadRequestException("Excel file has no header row");
            }

            Row headerRow = sheet.getRow(headerRowIdx);
            Map<String, Integer> colMap = buildColumnMap(headerRow, formatter);
            if (!colMap.containsKey("type") || !colMap.containsKey("content")) {
                throw new BadRequestException("Excel sheet must contain at least 'Type' and 'Content' columns in header row");
            }

            List<Map.Entry<String, Integer>> optionColumns = extractOptionColumns(colMap);
            List<ImportBlockResult> results = new ArrayList<>();

            int questionIndex = 0;
            for (int r = headerRowIdx + 1; r <= sheet.getLastRowNum(); r++) {
                Row row = sheet.getRow(r);
                if (row == null || isRowBlank(row, formatter, Math.min(MAX_COLUMNS, Math.max(0, (int) row.getLastCellNum())))) {
                    continue;
                }
                questionIndex++;
                if (questionIndex > MAX_QUESTIONS) {
                    throw new BadRequestException("Excel import supports at most " + MAX_QUESTIONS + " questions per file");
                }
                results.add(parseRow(row, r + 1, questionIndex, colMap, optionColumns, formatter));
            }
            return results;
        } catch (BadRequestException ex) {
            throw ex;
        } catch (IOException | RuntimeException ex) {
            throw new BadRequestException("Could not read the Excel file. Ensure it is a valid .xlsx or .xls workbook.");
        }
    }

    private ImportBlockResult parseRow(
            Row row,
            int excelRowNumber,
            int questionIndex,
            Map<String, Integer> colMap,
            List<Map.Entry<String, Integer>> optionColumns,
            DataFormatter formatter
    ) {
        String qType = readCell(row, colMap.get("type"), formatter).trim().toUpperCase(Locale.ROOT);
        String difficulty = readCell(row, colMap.get("difficulty"), formatter).trim().toUpperCase(Locale.ROOT);
        String content = readCell(row, colMap.get("content"), formatter).trim();
        String answerRaw = readCell(row, colMap.get("answer"), formatter).trim();
        String explanation = readCell(row, colMap.get("explanation"), formatter).trim();
        String matchingRightCell = readCell(row, colMap.get("matchingright"), formatter);
        String rubricCell = readCell(row, colMap.get("rubric"), formatter);
        String codeConfigCell = readCell(row, colMap.get("codeconfig"), formatter).trim();
        String testCasesCell = readCell(row, colMap.get("testcases"), formatter).trim();

        List<String[]> rawOptions = new ArrayList<>();
        for (Map.Entry<String, Integer> entry : optionColumns) {
            String optVal = readCell(row, entry.getValue(), formatter).trim();
            if (!optVal.isEmpty()) {
                rawOptions.add(new String[]{entry.getKey(), optVal});
            }
        }

        // For TRUE_FALSE, tolerate optional "True" / "False" labels placed in Option A / Option B.
        List<String[]> optionsForAssembler = rawOptions;
        if ("TRUE_FALSE".equals(qType) && isOptionalTrueFalseLabels(rawOptions)) {
            optionsForAssembler = List.of();
        }

        List<String[]> matchingRightRaw = parseMatchingRightCell(matchingRightCell);
        List<String> rubricLines = parseRubricCell(rubricCell);
        List<String> testCaseLines = parseTestCasesCell(testCasesCell);

        List<ImportErrorDto> preErrors = new ArrayList<>();
        return assembler.buildAndValidate(new ImportedQuestionAssembler.Input(
                questionIndex,
                excelRowNumber,
                qType,
                difficulty.isEmpty() ? null : difficulty,
                content,
                explanation.isEmpty() ? null : explanation,
                answerRaw,
                optionsForAssembler,
                matchingRightRaw,
                rubricLines,
                List.of(),
                codeConfigCell.isEmpty() ? null : codeConfigCell,
                testCaseLines,
                preErrors
        ));
    }

    private boolean isOptionalTrueFalseLabels(List<String[]> opts) {
        if (opts.size() != 2) return false;
        String a = opts.get(0)[1].trim().toLowerCase(Locale.ROOT);
        String b = opts.get(1)[1].trim().toLowerCase(Locale.ROOT);
        return ("A".equals(opts.get(0)[0]) && "B".equals(opts.get(1)[0]))
                && (("true".equals(a) && "false".equals(b)) || ("false".equals(a) && "true".equals(b)));
    }

    private List<String[]> parseMatchingRightCell(String cell) {
        List<String[]> items = new ArrayList<>();
        if (cell == null || cell.isBlank()) return items;
        String[] lines = cell.split("\\r?\\n");
        int seq = 1;
        for (String line : lines) {
            String trimmed = line.trim();
            if (trimmed.isEmpty()) continue;
            Matcher m = NUMBERED_RIGHT_ITEM.matcher(trimmed);
            if (m.matches()) {
                items.add(new String[]{m.group(1).trim(), m.group(2).trim()});
                try {
                    seq = Math.max(seq, Integer.parseInt(m.group(1).trim()) + 1);
                } catch (NumberFormatException ignored) {}
            } else {
                items.add(new String[]{String.valueOf(seq++), trimmed});
            }
        }
        return items;
    }

    private List<String> parseRubricCell(String cell) {
        List<String> lines = new ArrayList<>();
        if (cell == null || cell.isBlank()) return lines;
        for (String line : cell.split("\\r?\\n")) {
            String trimmed = line.trim();
            if (trimmed.isEmpty() || "RUBRIC:".equalsIgnoreCase(trimmed)) continue;
            lines.add(trimmed);
        }
        return lines;
    }

    private List<String> parseTestCasesCell(String cell) {
        List<String> list = new ArrayList<>();
        if (cell == null || cell.isBlank()) return list;
        String trimmed = cell.trim();
        if (trimmed.startsWith("[")) {
            list.add(trimmed);
            return list;
        }
        for (String line : trimmed.split("\\r?\\n")) {
            String t = line.trim();
            if (t.isEmpty()) continue;
            if (t.toUpperCase(Locale.ROOT).startsWith("TEST_CASE:")) {
                t = t.substring("TEST_CASE:".length()).trim();
            }
            if (!t.isEmpty()) {
                list.add(t);
            }
        }
        return list;
    }

    private Sheet resolveQuestionsSheet(Workbook workbook) {
        if (workbook.getNumberOfSheets() == 0) return null;
        for (int i = 0; i < workbook.getNumberOfSheets(); i++) {
            String name = workbook.getSheetName(i);
            if (name != null && "questions".equalsIgnoreCase(name.trim())) {
                return workbook.getSheetAt(i);
            }
        }
        for (int i = 0; i < workbook.getNumberOfSheets(); i++) {
            String name = workbook.getSheetName(i);
            if (name == null || !name.toLowerCase(Locale.ROOT).contains("guide")) {
                return workbook.getSheetAt(i);
            }
        }
        return workbook.getSheetAt(0);
    }

    private int findHeaderRowIndex(Sheet sheet) {
        DataFormatter formatter = new DataFormatter();
        for (int r = 0; r <= Math.min(sheet.getLastRowNum(), 20); r++) {
            Row row = sheet.getRow(r);
            if (row != null && !isRowBlank(row, formatter, Math.min(MAX_COLUMNS, Math.max(0, (int) row.getLastCellNum())))) {
                return r;
            }
        }
        return -1;
    }

    private Map<String, Integer> buildColumnMap(Row headerRow, DataFormatter formatter) {
        Map<String, Integer> map = new HashMap<>();
        int width = Math.min(MAX_COLUMNS, Math.max(0, (int) headerRow.getLastCellNum()));
        for (int c = 0; c < width; c++) {
            String normalized = normalizeHeader(readCell(headerRow, c, formatter));
            if (!normalized.isEmpty()) {
                map.putIfAbsent(normalized, c);
            }
        }
        return map;
    }

    private List<Map.Entry<String, Integer>> extractOptionColumns(Map<String, Integer> colMap) {
        List<Map.Entry<String, Integer>> options = new ArrayList<>();
        for (char letter = 'a'; letter <= 'j'; letter++) {
            Integer idx = colMap.get("option" + letter);
            if (idx != null) {
                options.add(Map.entry(String.valueOf(Character.toUpperCase(letter)), idx));
            }
        }
        // Fallback for any non-standard OptionX matched dynamically
        if (options.isEmpty()) {
            for (Map.Entry<String, Integer> entry : colMap.entrySet()) {
                Matcher m = OPTION_COLUMN_HEADER.matcher(entry.getKey());
                if (m.matches()) {
                    options.add(Map.entry(m.group(1).toUpperCase(Locale.ROOT), entry.getValue()));
                }
            }
        }
        return options;
    }

    private String normalizeHeader(String raw) {
        if (raw == null) return "";
        return raw.replaceAll("[^A-Za-z0-9]", "").toLowerCase(Locale.ROOT);
    }

    private boolean isRowBlank(Row row, DataFormatter formatter, int width) {
        for (int c = 0; c < width; c++) {
            if (!readCell(row, c, formatter).trim().isEmpty()) {
                return false;
            }
        }
        return true;
    }

    private String readCell(Row row, Integer colIndex, DataFormatter formatter) {
        if (row == null || colIndex == null || colIndex < 0) return "";
        Cell cell = row.getCell(colIndex);
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
}
