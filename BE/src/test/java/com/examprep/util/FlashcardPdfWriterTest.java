package com.examprep.util;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
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
                        new FlashcardPdfWriter.CardData("Loop in Java", "Repeat a block", "JAVA", "for(int i=0;i<10;i++){}"))));
        assertTrue(out.content().length > 0);
        assertTrue(new String(out.content(), 0, 5, java.nio.charset.StandardCharsets.US_ASCII).equals("%PDF-"));
        String extracted = text(out.content());
        assertTrue(extracted.contains("Quang hợp"), "Vietnamese back face missing: " + extracted);
        assertTrue(extracted.contains("Photosynthesis"));
        assertTrue(extracted.contains("for(int i=0;i<10;i++){}"), "Code body missing");
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
}
