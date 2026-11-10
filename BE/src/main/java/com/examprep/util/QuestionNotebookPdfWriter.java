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

    public RenderedPdf write(List<QuestionReviewItemDto> questions) {
        try (PDDocument doc = new PDDocument()) {
            PDFont regular = font(doc, 0);
            PDFont bold = font(doc, 1);

            PDPage page = new PDPage(PDRectangle.A4);
            doc.addPage(page);
            PDPageContentStream cs = new PDPageContentStream(doc, page);

            float y = 750f;
            cs.beginText();
            cs.setFont(bold, 16);
            cs.newLineAtOffset(40, y);
            cs.showText("Question Notebook Export");
            cs.endText();
            y -= 35;

            for (int i = 0; i < questions.size(); i++) {
                QuestionReviewItemDto q = questions.get(i);

                // Estimate required space for question header, text, and options
                int optionCount = q.getOptions() != null ? q.getOptions().size() : 0;
                float estimatedHeight = 40f + (optionCount * 15f);
                if (y < estimatedHeight || y < 80f) {
                    cs.close();
                    page = new PDPage(PDRectangle.A4);
                    doc.addPage(page);
                    cs = new PDPageContentStream(doc, page);
                    y = 750f;
                }

                // Question Header
                cs.beginText();
                cs.setFont(bold, 10);
                cs.newLineAtOffset(40, y);
                String header = (i + 1) + ". [" + (q.getQuestionType() != null ? q.getQuestionType() : "QUESTION") + "]";
                if (q.isWrong()) {
                    header += " (Missed " + q.getWrongCount() + "x)";
                }
                cs.showText(header);
                cs.endText();
                y -= 15;

                // Question Text
                cs.beginText();
                cs.setFont(regular, 9);
                cs.newLineAtOffset(50, y);
                String text = q.getQuestionText() != null ? q.getQuestionText().replaceAll("\\r?\\n", " ") : "";
                if (text.length() > 105) text = text.substring(0, 105) + "...";
                cs.showText(text);
                cs.endText();
                y -= 18;

                // Options and Correct Answer indicator
                if (q.getOptions() != null && !q.getOptions().isEmpty()) {
                    char optionLabel = 'A';
                    for (QuestionReviewItemDto.OptionDto opt : q.getOptions()) {
                        boolean isCorrect = q.getCorrectOptionIds() != null && q.getCorrectOptionIds().contains(opt.getOptionId());

                        cs.beginText();
                        cs.setFont(isCorrect ? bold : regular, 9);
                        cs.newLineAtOffset(60, y);
                        String optPrefix = (optionLabel++) + ". ";
                        String optText = opt.getOptionText() != null ? opt.getOptionText().replaceAll("\\r?\\n", " ") : "";
                        if (optText.length() > 95) optText = optText.substring(0, 95) + "...";

                        String line = optPrefix + optText;
                        if (isCorrect) {
                            line += " [CORRECT]";
                        }
                        cs.showText(line);
                        cs.endText();
                        y -= 14;
                    }
                }
                y -= 12; // spacing between questions
            }
            cs.close();

            ByteArrayOutputStream out = new ByteArrayOutputStream();
            doc.save(out);
            return new RenderedPdf(out.toByteArray(), "question-notebook.pdf");
        } catch (IOException e) {
            log.error("Failed to render question notebook PDF export", e);
            throw new BaseException(ResponseCode.INTERNAL_SERVER_ERROR, "Failed to render PDF export");
        }
    }
}
