package com.examprep.util;

import com.examprep.dto.ResponseCode;
import com.examprep.dto.student.QuestionReviewItemDto;
import com.examprep.exceptions.BaseException;
import lombok.extern.slf4j.Slf4j;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDFont;
import org.apache.pdfbox.pdmodel.font.PDType0Font;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.List;

@Slf4j
@Component
public class QuestionNotebookPdfWriter {

    public record RenderedPdf(byte[] content, String fileName) {}

    private static final String[] FONT_FILES = {"fonts/DejaVuSans.ttf", "fonts/DejaVuSans-Bold.ttf", "fonts/DejaVuSansMono.ttf"};
    private static final byte[][] FONT_BYTES = loadFonts();

    private static byte[][] loadFonts() {
        try {
            byte[][] fonts = new byte[FONT_FILES.length][];
            for (int i = 0; i < FONT_FILES.length; i++) {
                try (InputStream in = new ClassPathResource(FONT_FILES[i]).getInputStream()) {
                    fonts[i] = in.readAllBytes();
                }
            }
            return fonts;
        } catch (Exception e) {
            log.error("Failed to load DejaVu TTF fonts for PDF rendering", e);
            return new byte[FONT_FILES.length][0];
        }
    }

    private static PDFont font(PDDocument doc, int index) throws IOException {
        return PDType0Font.load(doc, new java.io.ByteArrayInputStream(FONT_BYTES[index]), true);
    }

    private static final float TOP_Y = 750f;
    private static final float BOTTOM_Y = 55f;
    private static final float PAGE_RIGHT = PDRectangle.A4.getWidth() - 40f;

    public RenderedPdf write(List<QuestionReviewItemDto> questions) {
        try (PDDocument doc = new PDDocument()) {
            PDFont regular = font(doc, 0);
            PDFont bold = font(doc, 1);

            PDPage page = new PDPage(PDRectangle.A4);
            doc.addPage(page);
            PDPageContentStream cs = new PDPageContentStream(doc, page);
            try {
                float y = TOP_Y;
                cs.beginText();
                cs.setFont(bold, 16);
                cs.newLineAtOffset(40, y);
                cs.showText("Question Notebook Export");
                cs.endText();
                y -= 35;

                List<QuestionReviewItemDto> items = questions == null ? List.of() : questions;
                for (int i = 0; i < items.size(); i++) {
                    QuestionReviewItemDto q = items.get(i);
                    if (y < BOTTOM_Y + 30f) {
                        cs.close();
                        page = new PDPage(PDRectangle.A4);
                        doc.addPage(page);
                        cs = new PDPageContentStream(doc, page);
                        y = TOP_Y;
                    }

                    // Question Header
                    String header = (i + 1) + ". [" + (q.getQuestionType() != null ? q.getQuestionType() : "QUESTION") + "]";
                    if (q.isWrong()) {
                        header += " (Missed " + q.getWrongCount() + "x)";
                    }
                    header = FlashcardPdfWriter.safe(header, bold).replace('\n', ' ');
                    cs.beginText();
                    cs.setFont(bold, 10);
                    cs.newLineAtOffset(40, y);
                    cs.showText(header);
                    cs.endText();
                    y -= 15;

                    // Question Text (sanitized, wrapped cleanly across pages)
                    String rawText = q.getQuestionText() != null ? q.getQuestionText() : "";
                    for (String line : FlashcardPdfWriter.wrap(rawText, regular, 9f, PAGE_RIGHT - 50f)) {
                        if (y < BOTTOM_Y) {
                            cs.close();
                            page = new PDPage(PDRectangle.A4);
                            doc.addPage(page);
                            cs = new PDPageContentStream(doc, page);
                            y = TOP_Y;
                        }
                        cs.beginText();
                        cs.setFont(regular, 9);
                        cs.newLineAtOffset(50, y);
                        cs.showText(line);
                        cs.endText();
                        y -= 13;
                    }
                    y -= 4;

                    // Options and Correct Answer indicator (paginated per line so large option lists never overflow)
                    if (q.getOptions() != null && !q.getOptions().isEmpty()) {
                        for (int optIdx = 0; optIdx < q.getOptions().size(); optIdx++) {
                            QuestionReviewItemDto.OptionDto opt = q.getOptions().get(optIdx);
                            boolean isCorrect = q.getCorrectOptionIds() != null
                                    && q.getCorrectOptionIds().contains(opt.getOptionId());
                            PDFont optFont = isCorrect ? bold : regular;
                            String label = optIdx < 26 ? String.valueOf((char) ('A' + optIdx)) : String.valueOf(optIdx + 1);
                            String optText = opt.getOptionText() != null ? opt.getOptionText() : "";
                            String fullOpt = label + ". " + optText + (isCorrect ? " [CORRECT]" : "");
                            for (String line : FlashcardPdfWriter.wrap(fullOpt, optFont, 9f, PAGE_RIGHT - 60f)) {
                                if (y < BOTTOM_Y) {
                                    cs.close();
                                    page = new PDPage(PDRectangle.A4);
                                    doc.addPage(page);
                                    cs = new PDPageContentStream(doc, page);
                                    y = TOP_Y;
                                }
                                cs.beginText();
                                cs.setFont(optFont, 9);
                                cs.newLineAtOffset(60, y);
                                cs.showText(line);
                                cs.endText();
                                y -= 13;
                            }
                        }
                    }
                    y -= 12; // spacing between questions
                }
            } finally {
                cs.close();
            }

            ByteArrayOutputStream out = new ByteArrayOutputStream();
            doc.save(out);
            return new RenderedPdf(out.toByteArray(), "question-notebook.pdf");
        } catch (IOException e) {
            log.error("Failed to render question notebook PDF export", e);
            throw new BaseException(ResponseCode.INTERNAL_SERVER_ERROR, "Failed to render PDF export");
        }
    }
}
