package com.examprep.question.importer;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.poi.ss.usermodel.BorderStyle;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellStyle;
import org.apache.poi.ss.usermodel.DataValidation;
import org.apache.poi.ss.usermodel.DataValidationConstraint;
import org.apache.poi.ss.usermodel.DataValidationHelper;
import org.apache.poi.ss.usermodel.FillPatternType;
import org.apache.poi.ss.usermodel.Font;
import org.apache.poi.ss.usermodel.IndexedColors;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.VerticalAlignment;
import org.apache.poi.ss.util.CellRangeAddressList;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.apache.poi.xwpf.usermodel.XWPFParagraph;
import org.apache.poi.xwpf.usermodel.XWPFRun;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.List;

public class TemplateGeneratorTest {

    // Regenerates the tracked binaries under src/main/resources, so it must never run as part of a
    // normal build: PDF/DOCX/XLSX output embeds timestamps and dirties the working tree on every run.
    // Run explicitly with -DgenerateTemplates=true when the template text changes.
    @Test
    @EnabledIfSystemProperty(named = "generateTemplates", matches = "true")
    public void generateTemplatesFromTxt() throws Exception {
        Path txtPath = Paths.get("docs/import/template-v2.txt");
        if (!Files.exists(txtPath)) {
            throw new IllegalStateException("template-v2.txt not found");
        }
        List<String> lines = Files.readAllLines(txtPath);

        Path outDir = Paths.get("src/main/resources/templates/import");
        Files.createDirectories(outDir);

        generateDocx(lines, outDir.resolve("apepp-question-template-v2.docx"));
        generatePdf(lines, outDir.resolve("apepp-question-template-v2.pdf"));
        generateXlsx(outDir.resolve("apepp-question-template-v2.xlsx"));

        System.out.println("Templates (DOCX, PDF, XLSX) generated successfully in src/main/resources/templates/import/");
    }

    private void generateDocx(List<String> lines, Path docxPath) throws Exception {
        try (XWPFDocument doc = new XWPFDocument()) {
            for (String line : lines) {
                XWPFParagraph p = doc.createParagraph();
                XWPFRun r = p.createRun();
                r.setText(line);
            }
            try (var out = Files.newOutputStream(docxPath)) {
                doc.write(out);
            }
        }
    }

    private void generatePdf(List<String> lines, Path pdfPath) throws Exception {
        try (PDDocument doc = new PDDocument()) {
            PDPage page = new PDPage();
            doc.addPage(page);
            PDPageContentStream contentStream = new PDPageContentStream(doc, page);
            contentStream.beginText();
            contentStream.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 9.5f);
            contentStream.setLeading(14.0f);
            contentStream.newLineAtOffset(45, 750);

            float y = 750;
            for (String line : lines) {
                if (y < 50) {
                    contentStream.endText();
                    contentStream.close();
                    page = new PDPage();
                    doc.addPage(page);
                    contentStream = new PDPageContentStream(doc, page);
                    contentStream.beginText();
                    contentStream.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 9.5f);
                    contentStream.setLeading(14.0f);
                    contentStream.newLineAtOffset(45, 750);
                    y = 750;
                }
                String safeLine = line.replaceAll("[^\\p{Print}]", " ");
                contentStream.showText(safeLine);
                contentStream.newLine();
                y -= 14.0f;
            }
            contentStream.endText();
            contentStream.close();

            doc.save(pdfPath.toFile());
        }
    }

    private void generateXlsx(Path xlsxPath) throws Exception {
        try (XSSFWorkbook wb = new XSSFWorkbook()) {
            Sheet qSheet = wb.createSheet("Questions");
            Sheet gSheet = wb.createSheet("Guide & Examples");

            Font headerFont = wb.createFont();
            headerFont.setBold(true);
            headerFont.setColor(IndexedColors.WHITE.getIndex());

            CellStyle headerStyle = wb.createCellStyle();
            headerStyle.setFont(headerFont);
            headerStyle.setFillForegroundColor(IndexedColors.DARK_BLUE.getIndex());
            headerStyle.setFillPattern(FillPatternType.SOLID_FOREGROUND);
            headerStyle.setBorderBottom(BorderStyle.THIN);
            headerStyle.setVerticalAlignment(VerticalAlignment.CENTER);
            headerStyle.setWrapText(true);

            CellStyle wrapStyle = wb.createCellStyle();
            wrapStyle.setWrapText(true);
            wrapStyle.setVerticalAlignment(VerticalAlignment.TOP);

            String[] headers = {
                    "Type", "Difficulty", "Content",
                    "Option A", "Option B", "Option C", "Option D", "Option E", "Option F",
                    "Matching Right", "Answer", "Explanation", "Rubric",
                    "Code Config", "Test Cases", "Diagram XML"
            };

            Row headerRow = qSheet.createRow(0);
            headerRow.setHeightInPoints(26);
            for (int c = 0; c < headers.length; c++) {
                Cell cell = headerRow.createCell(c);
                cell.setCellValue(headers[c]);
                cell.setCellStyle(headerStyle);
            }

            List<String[]> sampleRows = List.of(
                    new String[]{
                            "SINGLE_CHOICE", "EASY", "What is the output of 2 + 2?",
                            "3", "4", "5", "6", "", "",
                            "", "B", "2 + 2 equals 4.", "", "", "", ""
                    },
                    new String[]{
                            "MULTIPLE_CHOICE", "EASY", "Which are programming languages?",
                            "Java", "Python", "Photoshop", "C++", "", "",
                            "", "A, B, D", "Java, Python, and C++ are programming languages.", "", "", "", ""
                    },
                    new String[]{
                            "TRUE_FALSE", "EASY", "Java is an object-oriented language.",
                            "True", "False", "", "", "", "",
                            "", "True", "Java supports classes, inheritance, and polymorphism.", "", "", "", ""
                    },
                    new String[]{
                            "FILL_BLANK", "MEDIUM", "Tokyo is in ____ and Osaka is in ____.",
                            "", "", "", "", "", "",
                            "", "1=Japan; 2=Japan", "Both cities are located in Japan.", "", "", "", ""
                    },
                    new String[]{
                            "ORDERING", "MEDIUM", "Arrange the steps in the correct order.",
                            "Execute the program", "Write the source code", "Compile the code", "Test the result", "", "",
                            "", "B, C, A, D", "", "", "", "", ""
                    },
                    new String[]{
                            "MATCHING", "MEDIUM", "Match each item with its definition.",
                            "HTML", "Java", "", "", "", "",
                            "1. Programming language\n2. Markup language", "A-2, B-1", "", "", "", "", ""
                    },
                    new String[]{
                            "ESSAY", "HARD", "Explain why Java uses garbage collection and what trade-off it brings.",
                            "", "", "", "", "", "",
                            "", "", "Reclaims unreferenced objects automatically with GC pause overhead.",
                            "- Memory management | 2 | Explains that unreachable objects are reclaimed automatically\n- Trade-off | 2 | Mentions pause time or runtime overhead",
                            "", "", ""
                    },
                    new String[]{
                            "CODE", "MEDIUM", "Read two integers from stdin and print their sum.",
                            "", "", "", "", "", "",
                            "", "", "", "",
                            "{\"allowedLanguages\":[\"JAVA\"],\"codeTemplate\":\"\",\"timeLimitMs\":5000,\"memoryLimitKb\":262144}",
                            "[{\"inputData\":\"2 3\\n\",\"expectedOutput\":\"5\",\"hidden\":false},{\"inputData\":\"-4 1\\n\",\"expectedOutput\":\"-3\",\"hidden\":true}]",
                            ""
                    },
                    new String[]{
                            "DIAGRAM_ESSAY", "HARD", "Draw a class diagram for the described library and explain the relationships.",
                            "", "", "", "", "", "",
                            "", "", "Separate Book from physical copies for lending.",
                            "- Classes and attributes | 2 | Includes the required classes and attributes\n- Relationships | 3 | Uses correct associations and multiplicities",
                            "", "",
                            "<mxGraphModel><root><mxCell id=\"0\"/><mxCell id=\"1\" parent=\"0\"/></root></mxGraphModel>"
                    }
            );

            for (int i = 0; i < sampleRows.size(); i++) {
                Row row = qSheet.createRow(i + 1);
                String[] vals = sampleRows.get(i);
                for (int c = 0; c < headers.length; c++) {
                    Cell cell = row.createCell(c);
                    cell.setCellValue(vals[c]);
                    cell.setCellStyle(wrapStyle);
                }
            }

            int[] widths = {18, 13, 42, 20, 20, 20, 20, 18, 18, 28, 22, 30, 40, 36, 42, 36};
            for (int c = 0; c < widths.length; c++) {
                qSheet.setColumnWidth(c, widths[c] * 256);
            }
            qSheet.createFreezePane(0, 1);

            DataValidationHelper dvHelper = qSheet.getDataValidationHelper();
            DataValidationConstraint typeConstraint = dvHelper.createExplicitListConstraint(new String[]{
                    "SINGLE_CHOICE", "MULTIPLE_CHOICE", "TRUE_FALSE", "MATCHING", "FILL_BLANK",
                    "ORDERING", "ESSAY", "CODE", "DIAGRAM", "DIAGRAM_ESSAY"
            });
            DataValidation typeValidation = dvHelper.createValidation(typeConstraint, new CellRangeAddressList(1, 500, 0, 0));
            typeValidation.setShowErrorBox(true);
            qSheet.addValidationData(typeValidation);

            DataValidationConstraint diffConstraint = dvHelper.createExplicitListConstraint(new String[]{"EASY", "MEDIUM", "HARD"});
            DataValidation diffValidation = dvHelper.createValidation(diffConstraint, new CellRangeAddressList(1, 500, 1, 1));
            diffValidation.setShowErrorBox(true);
            qSheet.addValidationData(diffValidation);

            buildGuideSheet(gSheet, headerStyle, wrapStyle);

            try (var out = Files.newOutputStream(xlsxPath)) {
                wb.write(out);
            }
        }
    }

    private void buildGuideSheet(Sheet gSheet, CellStyle headerStyle, CellStyle wrapStyle) {
        String[][] guideRows = {
                {"Field / Rule", "Details"},
                {"Sheet 'Questions'", "Each non-empty row after Row 1 represents one question. Max 500 questions per file."},
                {"Course & Module", "Selected on the import screen UI — do not put Course or Module columns inside Excel."},
                {"Type (Required)", "SINGLE_CHOICE, MULTIPLE_CHOICE, TRUE_FALSE, MATCHING, FILL_BLANK, ORDERING, ESSAY, CODE, DIAGRAM, DIAGRAM_ESSAY"},
                {"Difficulty (Required)", "EASY, MEDIUM, or HARD (required for every question — there is no default difficulty)."},
                {"Content (Required)", "Question prompt text. For FILL_BLANK, use ____ or {{1}}, {{2}} placeholders."},
                {"Option A..Option F", "Choices for SINGLE_CHOICE, MULTIPLE_CHOICE, ORDERING, or Left items for MATCHING."},
                {"Matching Right", "Used for MATCHING only. Enter one numbered item per line, e.g. '1. HyperText' then Alt+Enter '2. Mail Protocol'."},
                {"Answer", "SC: B | MC: A, B, D | TF: True / False | ORDERING: B, C, A, D | MATCHING: A-2, B-1 | FILL_BLANK: Tokyo or 1=Japan; 2=Japan"},
                {"Rubric (Essay/Diagram)", "Required for ESSAY, DIAGRAM, DIAGRAM_ESSAY. Format each line: - Criteria | weight | description"},
                {"Code Config", "Required JSON object for CODE with exactly 1 allowed language, e.g. {\"allowedLanguages\":[\"JAVA\"],\"timeLimitMs\":5000,\"memoryLimitKb\":262144}"},
                {"Test Cases", "Required for CODE (at least 1 hidden=false and 1 hidden=true). Paste a JSON array [...] or 1 JSON object per line."},
                {"Diagram XML", "Required for DIAGRAM and DIAGRAM_ESSAY: valid draw.io <mxGraphModel> or <mxfile> XML."}
        };
        for (int r = 0; r < guideRows.length; r++) {
            Row row = gSheet.createRow(r);
            for (int c = 0; c < 2; c++) {
                Cell cell = row.createCell(c);
                cell.setCellValue(guideRows[r][c]);
                cell.setCellStyle(r == 0 ? headerStyle : wrapStyle);
            }
        }
        gSheet.setColumnWidth(0, 26 * 256);
        gSheet.setColumnWidth(1, 96 * 256);
    }
}
