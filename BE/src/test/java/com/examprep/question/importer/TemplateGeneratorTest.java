package com.examprep.question.importer;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.apache.poi.xwpf.usermodel.XWPFParagraph;
import org.apache.poi.xwpf.usermodel.XWPFRun;
import org.junit.jupiter.api.Test;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.List;

public class TemplateGeneratorTest {

    @Test
    public void generateTemplatesFromTxt() throws Exception {
        Path txtPath = Paths.get("docs/import/template-v2.txt");
        if (!Files.exists(txtPath)) {
            throw new IllegalStateException("template-v2.txt not found");
        }
        List<String> lines = Files.readAllLines(txtPath);

        Path outDir = Paths.get("src/main/resources/templates/import");
        Files.createDirectories(outDir);

        // Generate DOCX
        try (XWPFDocument doc = new XWPFDocument()) {
            for (String line : lines) {
                XWPFParagraph p = doc.createParagraph();
                XWPFRun r = p.createRun();
                r.setText(line);
            }
            Path docxPath = outDir.resolve("apepp-question-template-v2.docx");
            try (var out = Files.newOutputStream(docxPath)) {
                doc.write(out);
            }
        }

        // Generate PDF
        try (PDDocument doc = new PDDocument()) {
            PDPage page = new PDPage();
            doc.addPage(page);
            PDPageContentStream contentStream = new PDPageContentStream(doc, page);
            contentStream.beginText();
            contentStream.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 10);
            contentStream.setLeading(14.5f);
            contentStream.newLineAtOffset(50, 750);

            float y = 750;
            for (String line : lines) {
                if (y < 50) {
                    contentStream.endText();
                    contentStream.close();
                    page = new PDPage();
                    doc.addPage(page);
                    contentStream = new PDPageContentStream(doc, page);
                    contentStream.beginText();
                    contentStream.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 10);
                    contentStream.setLeading(14.5f);
                    contentStream.newLineAtOffset(50, 750);
                    y = 750;
                }
                // Handle long lines or simple text output
                String safeLine = line.replaceAll("[^\\p{Print}]", " ");
                contentStream.showText(safeLine);
                contentStream.newLine();
                y -= 14.5f;
            }
            contentStream.endText();
            contentStream.close();

            Path pdfPath = outDir.resolve("apepp-question-template-v2.pdf");
            doc.save(pdfPath.toFile());
        }

        System.out.println("Templates generated successfully in src/main/resources/templates/import/");
    }
}
