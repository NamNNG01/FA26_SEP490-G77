package com.examprep.util;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.apache.pdfbox.text.TextPosition;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
class FlashcardPdfWriterTest {

    private final FlashcardPdfWriter writer = new FlashcardPdfWriter();

    private static String text(byte[] pdf) throws IOException {
        try (PDDocument document = Loader.loadPDF(pdf)) {
            return new PDFTextStripper().getText(document);
        }
    }

    @Test
    void rendersVietnameseAndCode() throws IOException {
        FlashcardPdfWriter.RenderedPdf out = writer.write(new FlashcardPdfWriter.DeckData(
                "Photosynthesis — Quang hợp", "Sinh học", "Nguyễn Văn A", "FLASHCARD", "PRIVATE",
                "Ôn tập chương 1: quang hợp.",
                List.of(new FlashcardPdfWriter.CardData("Photosynthesis", "Quang hợp: quá trình cây xanh tổng hợp chất hữu cơ.", null, null),
                        new FlashcardPdfWriter.CardData("Loop in Java", "Repeat a block", "JAVA", "for(int i=0;i<10;i++){\n  sum += i;\n}"))));
        assertTrue(out.content().length > 0);
        assertTrue(new String(out.content(), 0, 5, java.nio.charset.StandardCharsets.US_ASCII).equals("%PDF-"));
        String extracted = text(out.content());
        assertTrue(extracted.contains("Quang hợp"), "Vietnamese back face missing: " + extracted);
        assertTrue(extracted.contains("Photosynthesis"));
        assertTrue(extracted.contains("for(int i=0;i<10;i++){") && extracted.contains("sum += i;"), "Code body missing: " + extracted);
        assertTrue(out.fileName().endsWith("-flashcards.pdf"));
    }

    @Test
    void longFacePaginates() throws IOException {
        String face = "từ vựng ".repeat(250);
        List<FlashcardPdfWriter.CardData> cards = new java.util.ArrayList<>();
        for (int i = 0; i < 45; i++) {
            cards.add(new FlashcardPdfWriter.CardData("Filler " + i, "ngắn", null, null));
        }
        // The long row starts mid-page and must split under a repeated header instead of overflowing.
        cards.add(new FlashcardPdfWriter.CardData("Front", face, null, null));
        FlashcardPdfWriter.RenderedPdf out = writer.write(new FlashcardPdfWriter.DeckData(
                "Dài", null, null, "FLASHCARD", "PRIVATE", null, cards));
        try (PDDocument document = Loader.loadPDF(out.content())) {
            assertTrue(document.getNumberOfPages() >= 2, "expected the long face to span pages, got " + document.getNumberOfPages());
        }
        String extracted = text(out.content());
        assertTrue(extracted.contains("từ vựng"));
    }

    @Test
    void emptyDeckStillRenders() throws IOException {
        FlashcardPdfWriter.RenderedPdf out = writer.write(new FlashcardPdfWriter.DeckData(
                "Empty", null, null, "FLASHCARD", "PRIVATE", null, List.of()));
        assertTrue(new String(out.content(), 0, 5, java.nio.charset.StandardCharsets.US_ASCII).equals("%PDF-"));
        try (PDDocument document = Loader.loadPDF(out.content())) {
            assertTrue(document.getNumberOfPages() >= 1);
        }
    }

    @Test
    void fileNameSanitizesNonAscii() {
        assertEquals("oop-phat-trien-phan-mem-flashcards.pdf", FlashcardPdfWriter.fileName(" OOP: phát triển phần mềm? "));
        assertEquals("deck-flashcards.pdf", FlashcardPdfWriter.fileName("???"));
    }

    @Test
    @org.junit.jupiter.api.Timeout(30)
    void unbreakableTokenDoesNotHang() throws IOException {
        // API-valid worst case: CardWrite allows 20,000-char code bodies (StudentDeckDtos).
        String body = "x".repeat(20000);
        FlashcardPdfWriter.RenderedPdf out = writer.write(new FlashcardPdfWriter.DeckData(
                "Base64", null, null, "CODE_SNIPPET", "PRIVATE", null,
                List.of(new FlashcardPdfWriter.CardData("What is this?", "The payload", "JAVA", body))));
        try (PDDocument document = Loader.loadPDF(out.content())) {
            assertTrue(document.getNumberOfPages() >= 2, "expected the unbreakable token to span pages");
        }
    }

    @Test
    void smallDeckPdfIsSubsetSoDownloadsStaySmall() throws IOException {
        FlashcardPdfWriter.RenderedPdf out = writer.write(new FlashcardPdfWriter.DeckData(
                "Nhỏ", "Môn học", "Chủ sở hữu", "FLASHCARD", "PRIVATE", "Mô tả ngắn",
                List.of(new FlashcardPdfWriter.CardData("Trước", "Sau", null, null))));
        assertTrue(out.content().length < 300_000,
                "expected a subset font export, got " + out.content().length + " bytes (full TTFs ≈ 1.8 MB)");
    }

    @Test
    void overlongDescriptionIsTruncatedNotInvisible() throws IOException {
        String description = "Mô tả ".repeat(1400) + " ENDMARK";
        FlashcardPdfWriter.RenderedPdf out = writer.write(new FlashcardPdfWriter.DeckData(
                "Dài mô tả", null, null, "FLASHCARD", "PRIVATE", description,
                List.of(new FlashcardPdfWriter.CardData("Trước", "Sau", null, null))));
        try (PDDocument document = Loader.loadPDF(out.content())) {
            assertEquals(1, document.getNumberOfPages(), "header block must not push the table off page 1");
        }
        String extracted = text(out.content());
        assertTrue(extracted.contains("…"), "expected a visible truncation marker");
        assertTrue(!extracted.contains("ENDMARK"), "dropped description lines must not be in the PDF at all");
    }

    @Test
    void standardDeckUsesTwoColumnsRightBelowHeader() throws IOException {
        FlashcardPdfWriter.RenderedPdf out = writer.write(new FlashcardPdfWriter.DeckData(
                "vgfavas", "English", "Manager Bob", "FLASHCARD", "PRIVATE", null,
                List.of(new FlashcardPdfWriter.CardData("ádasd", "đâs", null, null),
                        new FlashcardPdfWriter.CardData("Photosynthesis", "Quang hợp", null, null))));
        try (PDDocument document = Loader.loadPDF(out.content())) {
            assertEquals(1, document.getNumberOfPages(), "2-card deck must fit on page 1");
            float[] headerTopY = {-1f};
            PDFTextStripper finder = new PDFTextStripper() {
                @Override
                protected void writeString(String s, List<TextPosition> positions) throws IOException {
                    if (headerTopY[0] < 0 && s.contains("Front") && !positions.isEmpty()) {
                        headerTopY[0] = positions.get(0).getYDirAdj();
                    }
                    super.writeString(s, positions);
                }
            };
            String extracted = finder.getText(document);
            assertTrue(extracted.contains("Front Back"), "expected 2-column Front | Back header, got: " + extracted);
            assertTrue(!extracted.contains("# Front"), "table must not include a # column");
            assertTrue(headerTopY[0] > 0 && headerTopY[0] < 160f,
                    "table header should sit directly under the deck info, was at y=" + headerTopY[0]);
        }
    }
}
