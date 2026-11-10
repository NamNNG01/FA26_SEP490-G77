package com.examprep.util;

import com.examprep.dto.ResponseCode;
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

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.time.ZoneOffset;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Renders one flashcard deck as a downloadable PDF (brand-styled, Vietnamese-safe).
 *
 * Pure, stateless component: deck data in, PDF bytes out. Fonts are bundled DejaVu TTFs
 * because the standard-14 fonts cannot render Vietnamese diacritics; PDType0Font
 * instances are per-document, so the TTF bytes are cached and reloaded for every render.
 */
@Slf4j
@Component
public class FlashcardPdfWriter {

    public record CardData(String frontText, String backText, String codeLanguage, String codeBody) {}

    public record DeckData(String title, String courseName, String ownerName, String mode,
                           String visibility, String description, List<CardData> cards) {}

    public record RenderedPdf(byte[] content, String fileName) {}

    private static final String[] FONT_FILES = {"fonts/DejaVuSans.ttf", "fonts/DejaVuSans-Bold.ttf", "fonts/DejaVuSansMono.ttf"};
    private static final byte[][] FONT_BYTES = loadFonts();

    private static final float PAGE_W = PDRectangle.A4.getWidth();
    private static final float PAGE_H = PDRectangle.A4.getHeight();
    private static final float MARGIN = 40f;
    private static final float BOTTOM = MARGIN + 24f;
    private static final float TABLE_W = PAGE_W - 2 * MARGIN;
    private static final float LINE_H = 11f;
    private static final float HEADER_H = 18f;
    private static final float TEXT_SIZE = 8.5f;
    private static final float META_SIZE = 9f;

    private static final float[] TEAL = {0.051f, 0.486f, 0.424f};
    private static final float[] STRIPE = {0.902f, 0.949f, 0.941f};
    private static final float[] BORDER = {0.835f, 0.863f, 0.859f};
    private static final float[] MUTED = {0.373f, 0.42f, 0.416f};
    private static final float[] INK = {0.102f, 0.129f, 0.125f};
    private static final float[] WHITE = {1f, 1f, 1f};

    public RenderedPdf write(DeckData deck) {
        try (PDDocument doc = new PDDocument()) {
            PDFont regular = font(doc, 0);
            PDFont bold = font(doc, 1);
            PDFont mono = font(doc, 2);

            List<CardData> cards = deck.cards() == null ? List.of() : deck.cards();
            boolean hasCode = cards.stream().anyMatch(c -> c.codeBody() != null && !c.codeBody().isBlank());
            float[] widths = hasCode
                    ? new float[]{148f, 148f, 56f, TABLE_W - 352f}
                    : new float[]{TABLE_W / 2, TABLE_W / 2};
            float[] colX = columnStarts(widths);
            String[] labels = hasCode
                    ? new String[]{"Front", "Back", "Language", "Code"}
                    : new String[]{"Front", "Back"};

            float y;
            List<float[]> tableExtents = new ArrayList<>();
            PDPageContentStream cs = null;
            try {
                // Title and info block, first page only, never allowed to run into the table.
                PDPage page = newPage(doc);
                cs = new PDPageContentStream(doc, page);
                float floorY = BOTTOM + 2 * HEADER_H + 8f;
                y = PAGE_H - MARGIN;
                y = drawWrapped(cs, bold, 16f, deck.title(), MARGIN, TABLE_W, y, TEAL, floorY);
                List<String> meta = new ArrayList<>();
                meta.add("Course: " + (blank(deck.courseName()) ? "Personal" : deck.courseName()));
                if (!blank(deck.ownerName())) meta.add("Owner: " + deck.ownerName());
                meta.add("Type: " + modeLabel(deck.mode()));
                if (!blank(deck.visibility())) meta.add("Visibility: " + deck.visibility());
                meta.add("Cards: " + cards.size());
                y = drawWrapped(cs, regular, META_SIZE, String.join("   ·   ", meta), MARGIN, TABLE_W, y, MUTED, floorY);
                y = drawWrapped(cs, regular, META_SIZE, "Exported "
                        + ZonedDateTime.now(ZoneOffset.UTC).format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm")) + " UTC",
                        MARGIN, TABLE_W, y, MUTED, floorY);
                if (!blank(deck.description())) {
                    y = drawWrapped(cs, regular, META_SIZE, deck.description(), MARGIN, TABLE_W, y, MUTED, floorY);
                }
                if (cards.isEmpty()) {
                    y = drawWrapped(cs, regular, META_SIZE, "This deck has no cards.", MARGIN, TABLE_W, y, MUTED, floorY);
                }
                y = Math.max(y, floorY) - 8f;

                // Table header.
                y = drawTableHeader(cs, bold, y, widths, labels);
                tableExtents.add(new float[]{y + HEADER_H, y});
                float tableTop = y;

                for (int index = 0; index < cards.size(); index++) {
                    CardData card = cards.get(index);
                    String[] cells = hasCode
                            ? new String[]{card.frontText(), card.backText(), card.codeLanguage(), card.codeBody()}
                            : new String[]{card.frontText(), card.backText()};
                    PDFont[] fonts = hasCode
                            ? new PDFont[]{regular, regular, mono, mono}
                            : new PDFont[]{regular, regular};
                    List<List<String>> lines = cellLines(cells, fonts, widths);
                    int height = lines.stream().mapToInt(List::size).max().orElse(1);

                    for (int line = 0; line < height; line++) {
                        if (y - LINE_H < BOTTOM) {
                            cs.close();
                            tableExtents.set(tableExtents.size() - 1, new float[]{tableTop, y});
                            page = newPage(doc);
                            cs = new PDPageContentStream(doc, page);
                            y = drawTableHeader(cs, bold, PAGE_H - MARGIN, widths, labels);
                            tableTop = y;
                            tableExtents.add(new float[]{tableTop, y});
                        }
                        y -= LINE_H;
                        if (index % 2 == 1) {
                            cs.setNonStrokingColor(STRIPE[0], STRIPE[1], STRIPE[2]);
                            cs.addRect(MARGIN, y, TABLE_W, LINE_H);
                            cs.fill();
                        }
                        for (int c = 0; c < lines.size(); c++) {
                            if (line >= lines.get(c).size() || (hasCode && c == 2 && line > 0)) continue;
                            String value = lines.get(c).get(line);
                            drawText(cs, fonts[c], TEXT_SIZE, value, colX[c] + 4f, y + 3f, INK);
                        }
                    }
                    cs.setStrokingColor(BORDER[0], BORDER[1], BORDER[2]);
                    cs.setLineWidth(0.5f);
                    cs.moveTo(MARGIN, y);
                    cs.lineTo(MARGIN + TABLE_W, y);
                    cs.stroke();
                }
                tableExtents.set(tableExtents.size() - 1, new float[]{tableTop, y});
            } finally {
                if (cs != null) cs.close();
            }

            drawColumnLines(doc, colX, tableExtents);
            drawPageNumbers(doc, bold);
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            doc.save(out);
            return new RenderedPdf(out.toByteArray(), fileName(deck.title()));
        } catch (IOException e) {
            log.error("Failed to render flashcard PDF export", e);
            throw new BaseException(ResponseCode.INTERNAL_SERVER_ERROR, "Failed to render PDF export");
        }
    }

    /** An ASCII, header-safe file name: NFKD-stripped slug + suffix, "deck" when nothing survives. */
    public static String fileName(String title) {
        String slug = Normalizer.normalize(title == null ? "" : title, Normalizer.Form.NFKD)
                .replaceAll("\\p{M}+", "")
                .toLowerCase(Locale.ROOT)
                .replaceAll("[^a-z0-9]+", "-")
                .replaceAll("^-+|-+$", "");
        if (slug.length() > 60) slug = slug.substring(0, 60).replaceAll("-+$", "");
        if (slug.isEmpty()) slug = "deck";
        return slug + "-flashcards.pdf";
    }

    private static byte[][] loadFonts() {
        try {
            byte[][] fonts = new byte[FONT_FILES.length][];
            for (int i = 0; i < FONT_FILES.length; i++) {
                try (InputStream in = new ClassPathResource(FONT_FILES[i]).getInputStream()) {
                    fonts[i] = in.readAllBytes();
                }
            }
            return fonts;
        } catch (IOException e) {
            throw new IllegalStateException("Bundled DejaVu fonts missing from classpath", e);
        }
    }

    private static PDFont font(PDDocument doc, int index) throws IOException {
        // embedSubset=true makes PDDocument.save() subset the font automatically.
        return PDType0Font.load(doc, new ByteArrayInputStream(FONT_BYTES[index]), true);
    }

    private static PDPage newPage(PDDocument doc) {
        PDPage page = new PDPage(PDRectangle.A4);
        doc.addPage(page);
        return page;
    }

    private static float[] columnStarts(float[] widths) {
        float[] starts = new float[widths.length];
        float x = MARGIN;
        for (int i = 0; i < widths.length; i++) {
            starts[i] = x;
            x += widths[i];
        }
        return starts;
    }

    private static float drawTableHeader(PDPageContentStream cs, PDFont bold, float y, float[] widths, String[] labels) throws IOException {
        cs.setNonStrokingColor(TEAL[0], TEAL[1], TEAL[2]);
        cs.addRect(MARGIN, y - HEADER_H, TABLE_W, HEADER_H);
        cs.fill();
        cs.setStrokingColor(BORDER[0], BORDER[1], BORDER[2]);
        cs.setLineWidth(0.5f);
        cs.addRect(MARGIN, y - HEADER_H, TABLE_W, HEADER_H);
        cs.stroke();
        float[] starts = columnStarts(widths);
        for (int i = 0; i < labels.length; i++) {
            drawText(cs, bold, META_SIZE, labels[i], starts[i] + 4f, y - 12.5f, WHITE);
        }
        return y - HEADER_H;
    }

    private static List<List<String>> cellLines(String[] cells, PDFont[] fonts, float[] widths) {
        List<List<String>> lines = new ArrayList<>();
        for (int c = 0; c < cells.length; c++) {
            String value = cells[c] == null ? "" : cells[c];
            lines.add(wrap(value, fonts[c], TEXT_SIZE, widths[c] - 8f));
        }
        return lines;
    }

    /** Word-wrap to a pixel width; hard-splits tokens longer than a whole line; newlines break. O(text length). */
    private static List<String> wrap(String text, PDFont font, float size, float width) {
        List<String> out = new ArrayList<>();
        for (String paragraph : safe(text, font).split("\n", -1)) {
            if (paragraph.trim().isEmpty()) {
                out.add("");
                continue;
            }
            StringBuilder line = new StringBuilder();
            for (String word : paragraph.trim().split(" +")) {
                if (word.length() > 1 && widthOf(word, font, size) > width) {
                    if (line.length() > 0) {
                        out.add(line.toString());
                    }
                    line = new StringBuilder(hardSplit(word, font, size, width, out));
                    continue;
                }
                String candidate = line.length() == 0 ? word : line + " " + word;
                if (line.length() > 0 && widthOf(candidate, font, size) > width) {
                    out.add(line.toString());
                    line = new StringBuilder(word);
                } else {
                    line = new StringBuilder(candidate);
                }
            }
            out.add(line.toString());
        }
        return out;
    }

    /** Chunks an over-wide token into whole lines; returns the tail that starts the next line. O(token length). */
    private static String hardSplit(String word, PDFont font, float size, float width, List<String> out) {
        int pos = 0;
        while (pos < word.length()) {
            float acc = 0f;
            int i = pos;
            while (i < word.length()) {
                acc += charWidth(word.charAt(i), font, size);
                if (acc > width && i > pos) break;
                i++;
            }
            if (i >= word.length()) return word.substring(pos);
            out.add(word.substring(pos, i));
            pos = i;
        }
        return "";
    }

    private static float charWidth(char c, PDFont font, float size) {
        try {
            return font.getStringWidth(String.valueOf(c)) / 1000f * size;
        } catch (IOException | IllegalArgumentException e) {
            return size * 0.6f;
        }
    }

    private static float widthOf(String s, PDFont font, float size) {
        try {
            return font.getStringWidth(s) / 1000f * size;
        } catch (IOException | IllegalArgumentException e) {
            return s.length() * size * 0.6f;
        }
    }

    /** Replaces characters the font cannot encode (PDFBox would throw on showText) with '?'. */
    private static String safe(String text, PDFont font) {
        String cleaned = (text == null ? "" : text).replace("\t", "    ").replaceAll("[\\p{Cntrl}&&[^\n]]", "");
        StringBuilder out = new StringBuilder(cleaned.length());
        for (int i = 0; i < cleaned.length(); i++) {
            if (cleaned.charAt(i) == '\n') {
                out.append('\n');
                continue;
            }
            String ch = String.valueOf(cleaned.charAt(i));
            try {
                font.getStringWidth(ch);
                out.append(ch);
            } catch (IOException | IllegalArgumentException e) {
                out.append('?');
            }
        }
        return out.toString();
    }

    private static void drawText(PDPageContentStream cs, PDFont font, float size, String text, float x, float y, float[] color) throws IOException {
        cs.beginText();
        cs.setFont(font, size);
        if (color != null) cs.setNonStrokingColor(color[0], color[1], color[2]);
        cs.newLineAtOffset(x, y);
        cs.showText(text);
        cs.endText();
    }

    /** Word-wrapped text ending at the returned y; drops lines that would cross floorY and marks the cut with "…". */
    private static float drawWrapped(PDPageContentStream cs, PDFont font, float size, String text, float x, float width,
                                     float y, float[] color, float floorY) throws IOException {
        List<String> lines = wrap(text, font, size, width);
        int drawn = 0;
        for (int i = 0; i < lines.size(); i++) {
            boolean more = i < lines.size() - 1;
            float nextY = y - (size + 3f);
            if (nextY < floorY + (more ? size + 3f : 0)) break;
            drawText(cs, font, size, lines.get(i), x, y - size - 2f, color);
            y = nextY;
            drawn++;
        }
        if (drawn < lines.size() && y - (size + 3f) >= floorY) {
            drawText(cs, font, size, "…", x, y - size - 2f, color);
            y -= size + 3f;
        }
        return y;
    }

    private static String modeLabel(String mode) {
        if (mode == null) return "Flashcard";
        return switch (mode) {
            case "CODE_SNIPPET" -> "Code snippet";
            case "CODE_OUTPUT" -> "Code output";
            case "FLASHCARD" -> "Flashcard";
            default -> mode;
        };
    }

    /** Vertical lines between table columns, drawn per table page after the flow pass. */
    private static void drawColumnLines(PDDocument doc, float[] colX, List<float[]> extents) throws IOException {
        for (int p = 0; p < doc.getNumberOfPages() && p < extents.size(); p++) {
            float[] extent = extents.get(p);
            PDPageContentStream cs = new PDPageContentStream(doc, doc.getPage(p),
                    PDPageContentStream.AppendMode.APPEND, true, true);
            cs.setStrokingColor(BORDER[0], BORDER[1], BORDER[2]);
            cs.setLineWidth(0.5f);
            for (int c = 1; c < colX.length; c++) {
                cs.moveTo(colX[c], extent[0]);
                cs.lineTo(colX[c], extent[1]);
                cs.stroke();
            }
            cs.close();
        }
    }

    private static void drawPageNumbers(PDDocument doc, PDFont bold) throws IOException {
        int total = doc.getNumberOfPages();
        for (int i = 0; i < total; i++) {
            String label = "Page " + (i + 1) + " / " + total;
            PDPageContentStream cs = new PDPageContentStream(doc, doc.getPage(i),
                    PDPageContentStream.AppendMode.APPEND, true, true);
            float width = bold.getStringWidth(label) / 1000f * 8f;
            drawText(cs, bold, 8f, label, (PAGE_W - width) / 2, MARGIN - 12f, MUTED);
            cs.close();
        }
    }

    private static boolean blank(String value) {
        return value == null || value.isBlank();
    }
}
