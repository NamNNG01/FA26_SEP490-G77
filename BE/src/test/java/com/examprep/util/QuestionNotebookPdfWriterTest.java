package com.examprep.util;

import com.examprep.dto.student.QuestionReviewItemDto;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class QuestionNotebookPdfWriterTest {

    private final QuestionNotebookPdfWriter writer = new QuestionNotebookPdfWriter();

    @Test
    void handlesTabsControlCharsEmojiSurrogatesAndLargeOptionListsAcrossPages() throws IOException {
        List<QuestionReviewItemDto.OptionDto> fiftyOptions = new ArrayList<>(50);
        for (int i = 1; i <= 50; i++) {
            fiftyOptions.add(QuestionReviewItemDto.OptionDto.builder()
                    .optionId((long) i)
                    .optionText("Option #" + i + "\twith emoji 😀 & long text " + "abc ".repeat(12))
                    .build());
        }
        QuestionReviewItemDto item = QuestionReviewItemDto.builder()
                .questionId(1L)
                .questionType("MULTIPLE_CHOICE")
                .isWrong(true)
                .wrongCount(2)
                .questionText("Tab\there\u0007 and emoji 😀 plus long wrapped prompt: " + "word ".repeat(60))
                .options(fiftyOptions)
                .correctOptionIds(List.of(1L, 50L))
                .build();

        QuestionNotebookPdfWriter.RenderedPdf out = writer.write(List.of(item));
        assertTrue(out.content().length > 0);
        assertEquals("%PDF-", new String(out.content(), 0, 5, StandardCharsets.US_ASCII));

        try (PDDocument doc = Loader.loadPDF(out.content())) {
            assertTrue(doc.getNumberOfPages() >= 2, "50 wrapped options must paginate across pages");
            String extracted = new PDFTextStripper().getText(doc);
            assertTrue(extracted.contains("Option #50"));
            assertTrue(extracted.contains("[CORRECT]"));
        }
    }
}
