package com.examprep.controllers.student;

import com.examprep.entities.Course;
import com.examprep.entities.CourseManager;
import com.examprep.entities.Deck;
import com.examprep.entities.Module;
import com.examprep.entities.User;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.EntityManager;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.transaction.annotation.Transactional;

import java.io.ByteArrayOutputStream;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static com.examprep.controllers.student.Fixtures.as;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class FlashcardImportPreviewApiIntegrationTest {
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired EntityManager em;
    Fixtures f;
    User manager, student;
    Course course;
    Module module;

    @BeforeEach
    void fixtures() {
        f = new Fixtures(em);
        manager = f.account(User.ROLE_COURSE_MANAGER);
        student = f.account(User.ROLE_STUDENT);
        course = f.course(manager);
        module = f.module(course, "Java foundations");
        em.flush();
    }

    @ParameterizedTest
    @ValueSource(strings = {"docx", "xlsx"})
    void previewsThirtyCardsAsOneThroughThirty(String format) throws Exception {
        List<List<String>> rows = new java.util.ArrayList<>();
        for (int i = 1; i <= 30; i++) rows.add(List.of("Question " + i, "Answer " + i));
        JsonNode data = data(preview(table(format, rows)).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalRows").value(30))
                .andExpect(jsonPath("$.data.validCount").value(30))
                .andExpect(jsonPath("$.data.invalidCount").value(0)));
        for (int i = 0; i < 30; i++) {
            JsonNode card = data.path("cards").get(i);
            assertEquals(i + 1, card.path("rowIndex").asInt());
            assertEquals(i + 2, card.path("sourceRowIndex").asInt());
            assertEquals("Question " + (i + 1), card.path("frontText").asText());
            assertEquals("Answer " + (i + 1), card.path("backText").asText());
        }
    }

    @ParameterizedTest
    @ValueSource(strings = {"docx", "xlsx"})
    void ignoredRowsDoNotLeaveGapsAndInvalidCardsKeepTheirOrder(String format) throws Exception {
        JsonNode data = data(preview(table(format, List.of(
                List.of("First", "Answer"), List.of("", ""), List.of("Missing answer", ""),
                List.of("First", "Answer"), List.of("Last", "Answer"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalRows").value(4))
                .andExpect(jsonPath("$.data.validCount").value(2))
                .andExpect(jsonPath("$.data.invalidCount").value(2))
                .andExpect(jsonPath("$.data.duplicateCount").value(1))
                .andExpect(jsonPath("$.data.warnings[0].code").value("ROWS_IGNORED")));
        assertEquals(List.of(1, 2, 3, 4), indexes(data, "rowIndex"));
        assertEquals(List.of(2, 4, 5, 6), indexes(data, "sourceRowIndex"));
        assertFalse(data.path("cards").get(1).path("valid").asBoolean());
        assertTrue(data.path("cards").get(2).path("duplicate").asBoolean());
    }

    @Test
    void pdfPreviewStartsAtOneAndPreservesSourceLines() throws Exception {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try (PDDocument document = new PDDocument()) {
            PDPage page = new PDPage();
            document.addPage(page);
            try (PDPageContentStream content = new PDPageContentStream(document, page)) {
                content.beginText();
                content.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12);
                content.newLineAtOffset(50, 700);
                content.showText("First question    First answer");
                content.newLineAtOffset(0, -20);
                content.showText("An ignored line");
                content.newLineAtOffset(0, -20);
                content.showText("Second question    Second answer");
                content.endText();
            }
            document.save(bytes);
        }
        JsonNode data = data(preview(new MockMultipartFile("file", "cards.pdf", "application/pdf", bytes.toByteArray()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.totalRows").value(2)));
        assertEquals(List.of(1, 2), indexes(data, "rowIndex"));
        assertEquals(List.of(1, 3), indexes(data, "sourceRowIndex"));
    }

    @Test
    void courseOwnerCanImportIntoModuleWithoutAnAssignmentRow() throws Exception {
        JsonNode saved = data(bulk(manager, newDeck(course.getCourseId(), module.getModuleId()), "IMPORT")
                .andExpect(status().isCreated()).andExpect(jsonPath("$.data.createdCount").value(1)));
        Long deckId = saved.path("deckId").asLong();
        em.flush();
        em.clear();
        Deck deck = em.find(Deck.class, deckId);
        assertEquals(course.getCourseId(), deck.getCourse().getCourseId());
        assertEquals(module.getModuleId(), deck.getModule().getModuleId());
        assertEquals(manager.getUserId(), deck.getUser().getUserId());
        mvc.perform(get("/api/v1/manager/decks/{id}", deckId).with(as(manager)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.moduleId").value(module.getModuleId()))
                .andExpect(jsonPath("$.data.moduleTitle").value("Java foundations"));
    }

    @Test
    void assignedManagerCanSaveAiCardsIntoModule() throws Exception {
        User collaborator = f.account(User.ROLE_COURSE_MANAGER);
        em.persist(CourseManager.builder().course(course).user(collaborator).build());
        JsonNode saved = data(bulk(collaborator, newDeck(course.getCourseId(), module.getModuleId()), "AI")
                .andExpect(status().isCreated()));
        assertEquals(module.getModuleId(), em.find(Deck.class, saved.path("deckId").asLong()).getModule().getModuleId());
    }

    @Test
    void adminCanImportIntoCourseModule() throws Exception {
        User admin = f.account(User.ROLE_ADMIN);
        bulk(admin, newDeck(course.getCourseId(), module.getModuleId()), "IMPORT")
                .andExpect(status().isCreated());
    }

    @Test
    void studentCanStillCreatePersonalDeckWithoutCourseOrModule() throws Exception {
        JsonNode saved = data(bulk(student, newDeck(null, null), "IMPORT").andExpect(status().isCreated()));
        Deck deck = em.find(Deck.class, saved.path("deckId").asLong());
        assertNull(deck.getCourse());
        assertNull(deck.getModule());
    }

    @Test
    void moduleRemainsOptionalForCourseImports() throws Exception {
        JsonNode saved = data(bulk(manager, newDeck(course.getCourseId(), null), "IMPORT")
                .andExpect(status().isCreated()));
        Deck deck = em.find(Deck.class, saved.path("deckId").asLong());
        assertEquals(course.getCourseId(), deck.getCourse().getCourseId());
        assertNull(deck.getModule());
    }

    @Test
    void existingDeckImportKeepsModule() throws Exception {
        Deck deck = Deck.builder().user(manager).course(course).module(module).title("Existing").isPublic(false).build();
        em.persist(deck);
        mvc.perform(post("/api/v1/flashcards/bulk").with(as(manager)).contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("deckId", deck.getDeckId(), "source", "IMPORT",
                                "cards", List.of(Map.of("frontText", "Question", "backText", "Answer"))))))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.data.createdCount").value(1));
        em.flush();
        em.refresh(deck);
        assertEquals(module.getModuleId(), deck.getModule().getModuleId());
    }

    @Test
    void rejectsModuleWithoutCourse() throws Exception {
        bulk(manager, newDeck(null, module.getModuleId()), "IMPORT")
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.data.code").value("COURSE_REQUIRED"));
        assertEquals(0, deckCount());
    }

    @Test
    void rejectsModuleFromAnotherCourse() throws Exception {
        Module foreignModule = f.module(f.course(manager), "Foreign module");
        bulk(manager, newDeck(course.getCourseId(), foreignModule.getModuleId()), "IMPORT")
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.data.code").value("MODULE_COURSE_MISMATCH"));
        assertEquals(0, deckCount());
    }

    @Test
    void rejectsMissingModule() throws Exception {
        bulk(manager, newDeck(course.getCourseId(), Long.MAX_VALUE), "IMPORT")
                .andExpect(status().isNotFound()).andExpect(jsonPath("$.data.code").value("MODULE_NOT_FOUND"));
        assertEquals(0, deckCount());
    }

    @Test
    void rejectsForeignManagersAndStudentsForCourseImports() throws Exception {
        User stranger = f.account(User.ROLE_COURSE_MANAGER);
        for (User actor : List.of(stranger, student)) {
            bulk(actor, newDeck(course.getCourseId(), module.getModuleId()), "IMPORT")
                    .andExpect(status().isForbidden()).andExpect(jsonPath("$.data.code").value("FORBIDDEN_COURSE"));
        }
        assertEquals(0, deckCount());
    }

    @Test
    void validatesNestedDeckFields() throws Exception {
        for (long moduleId : List.of(0L, -1L)) {
            bulk(manager, newDeck(course.getCourseId(), moduleId), "IMPORT").andExpect(status().isBadRequest());
        }
        Map<String, Object> blankTitle = newDeck(course.getCourseId(), module.getModuleId());
        blankTitle.put("title", " ");
        bulk(manager, blankTitle, "IMPORT").andExpect(status().isBadRequest());
        bulk(manager, newDeck(0L, null), "IMPORT").andExpect(status().isBadRequest());
        assertEquals(0, deckCount());
    }

    private ResultActions preview(MockMultipartFile file) throws Exception {
        return mvc.perform(multipart("/api/v1/flashcards/import/preview").file(file).with(as(student)));
    }

    private ResultActions bulk(User actor, Map<String, Object> newDeck, String source) throws Exception {
        em.flush();
        return mvc.perform(post("/api/v1/flashcards/bulk").with(as(actor)).contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("newDeck", newDeck, "source", source,
                        "cards", List.of(Map.of("frontText", "Question", "backText", "Answer"))))));
    }

    private Map<String, Object> newDeck(Long courseId, Long moduleId) {
        Map<String, Object> result = new HashMap<>(Map.of("title", "Imported deck", "isPublic", false));
        if (courseId != null) result.put("courseId", courseId);
        if (moduleId != null) result.put("moduleId", moduleId);
        return result;
    }

    private JsonNode data(ResultActions result) throws Exception {
        return json.readTree(result.andReturn().getResponse().getContentAsByteArray()).path("data");
    }

    private List<Integer> indexes(JsonNode data, String field) {
        List<Integer> result = new java.util.ArrayList<>();
        data.path("cards").forEach(card -> result.add(card.path(field).asInt()));
        return result;
    }

    private long deckCount() {
        return em.createQuery("select count(d) from Deck d", Long.class).getSingleResult();
    }

    private MockMultipartFile table(String format, List<List<String>> rows) throws Exception {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        if ("docx".equals(format)) {
            try (XWPFDocument document = new XWPFDocument()) {
                document.createParagraph().createRun().setText("TEMPLATE=FLASHCARD_V1");
                var table = document.createTable(rows.size() + 1, 3);
                table.getRow(0).getCell(0).setText("STT");
                table.getRow(0).getCell(1).setText("Mặt trước");
                table.getRow(0).getCell(2).setText("Mặt sau");
                for (int i = 0; i < rows.size(); i++) {
                    table.getRow(i + 1).getCell(0).setText(String.valueOf(i + 1));
                    table.getRow(i + 1).getCell(1).setText(rows.get(i).get(0));
                    table.getRow(i + 1).getCell(2).setText(rows.get(i).get(1));
                }
                document.write(bytes);
            }
        } else {
            try (XSSFWorkbook workbook = new XSSFWorkbook()) {
                var sheet = workbook.createSheet("Flashcards");
                var header = sheet.createRow(0);
                header.createCell(0).setCellValue("STT");
                header.createCell(1).setCellValue("Mặt trước");
                header.createCell(2).setCellValue("Mặt sau");
                for (int i = 0; i < rows.size(); i++) {
                    var row = sheet.createRow(i + 1);
                    row.createCell(0).setCellValue(i + 1);
                    row.createCell(1).setCellValue(rows.get(i).get(0));
                    row.createCell(2).setCellValue(rows.get(i).get(1));
                }
                workbook.write(bytes);
            }
        }
        return new MockMultipartFile("file", "cards." + format, "application/octet-stream", bytes.toByteArray());
    }
}
