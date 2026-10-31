package com.examprep.util;

import org.apache.poi.ss.usermodel.*;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.apache.poi.xwpf.usermodel.XWPFTable;
import org.apache.poi.xwpf.usermodel.XWPFTableRow;
import org.junit.jupiter.api.Test;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;

public class TemplateGenerator {

    @Test
    public void generateTemplates() throws IOException {
        File dir1 = new File("src/main/resources/templates/import");
        if (!dir1.exists()) dir1.mkdirs();
        File dir2 = new File("src/main/resources/templates");
        if (!dir2.exists()) dir2.mkdirs();

        // 1. Generate XLSX
        try (Workbook book = new XSSFWorkbook()) {
            Sheet meta = book.createSheet("_meta");
            meta.createRow(0).createCell(0).setCellValue("FLASHCARD_TEMPLATE_V1");

            Sheet guide = book.createSheet("Hướng dẫn");
            guide.createRow(0).createCell(0).setCellValue("Hướng dẫn sử dụng: Tối đa 500 dòng, mỗi mặt tối đa 2000 ký tự.");

            Sheet sheet = book.createSheet("Flashcards");
            Row header = sheet.createRow(0);
            header.createCell(0).setCellValue("STT");
            header.createCell(1).setCellValue("Mặt trước");
            header.createCell(2).setCellValue("Mặt sau");

            Row r1 = sheet.createRow(1);
            r1.createCell(0).setCellValue(1);
            r1.createCell(1).setCellValue("Photosynthesis");
            r1.createCell(2).setCellValue("Quang hợp");

            File f1 = new File(dir1, "flashcard-import-template-v1.xlsx");
            try (FileOutputStream fos = new FileOutputStream(f1)) {
                book.write(fos);
            }
            File f1_alt = new File(dir2, "flashcard-import-template-v1.xlsx");
            try (FileOutputStream fos = new FileOutputStream(f1_alt)) {
                book.write(fos);
            }
        }

        // 2. Generate DOCX
        try (XWPFDocument doc = new XWPFDocument()) {
            var p1 = doc.createParagraph();
            p1.createRun().setText("TEMPLATE=FLASHCARD_V1 - Hướng dẫn sử dụng: Tối đa 500 dòng, mỗi mặt tối đa 2000 ký tự.");

            XWPFTable table = doc.createTable(2, 3);
            var hRow = table.getRow(0);
            hRow.getCell(0).setText("STT");
            hRow.getCell(1).setText("Mặt trước");
            hRow.getCell(2).setText("Mặt sau");

            var dRow = table.getRow(1);
            dRow.getCell(0).setText("1");
            dRow.getCell(1).setText("Photosynthesis");
            dRow.getCell(2).setText("Quang hợp");

            File f2 = new File(dir1, "flashcard-import-template-v1.docx");
            try (FileOutputStream fos = new FileOutputStream(f2)) {
                doc.write(fos);
            }
            File f2_alt = new File(dir2, "flashcard-import-template-v1.docx");
            try (FileOutputStream fos = new FileOutputStream(f2_alt)) {
                doc.write(fos);
            }
        }
    }
}
