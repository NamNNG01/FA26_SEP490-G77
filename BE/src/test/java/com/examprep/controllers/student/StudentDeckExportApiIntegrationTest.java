package com.examprep.controllers.student;

import com.examprep.entities.*;
import jakarta.persistence.EntityManager;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import static com.examprep.controllers.student.Fixtures.as;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Student PDF deck export (owner-only). */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class StudentDeckExportApiIntegrationTest {
    @Autowired MockMvc mvc;
    @Autowired EntityManager em;
    Fixtures f;
    User student, other;

    @BeforeEach
    void setUp() {
        f = new Fixtures(em);
        student = f.account(User.ROLE_STUDENT);
        other = f.account(User.ROLE_STUDENT);
        em.flush();
    }

    private long deck(User owner, String mode) {
        Deck value = Deck.builder().user(owner).title("Sinh học").mode(mode).isPublic(false).build();
        em.persist(value);
        return value.getDeckId();
    }

    private void card(long deckId, int position, String front, String back, String language, String code) {
        Deck deckRef = em.getReference(Deck.class, deckId);
        em.persist(Flashcard.builder().deck(deckRef).frontText(front).backText(back)
                .codeLanguage(language).codeBody(code).position(position).build());
    }

    @Test
    void exportOwnDeckStreamsPdf() throws Exception {
        long id = deck(student, "FLASHCARD");
        card(id, 1, "Photosynthesis", "Quang hợp", null, null);
        card(id, 2, "Loop in Java", "Repeat a block", "JAVA", "for(;;){}");
        em.flush();

        byte[] pdf = mvc.perform(get("/api/v1/student/decks/" + id + "/export").with(as(student)))
                .andExpect(status().isOk())
                .andExpect(content().contentType(MediaType.APPLICATION_PDF))
                .andExpect(header().string("Content-Disposition",
                        org.hamcrest.Matchers.matchesPattern("attachment; filename=\".*\\.pdf\"")))
                .andReturn().getResponse().getContentAsByteArray();
        assertTrue(new String(pdf, 0, 5, java.nio.charset.StandardCharsets.US_ASCII).equals("%PDF-"));
        try (PDDocument document = Loader.loadPDF(pdf)) {
            assertTrue(new PDFTextStripper().getText(document).contains("Quang hợp"));
        }
    }

    @Test
    void exportRejectsForeignAndUnknownDecks() throws Exception {
        long id = deck(student, "FLASHCARD");
        card(id, 1, "a", "b", null, null);
        em.flush();
        mvc.perform(get("/api/v1/student/decks/" + id + "/export").with(as(other))).andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/student/decks/" + Long.MAX_VALUE + "/export").with(as(student))).andExpect(status().isNotFound());
    }

    @Test
    void exportRejectsUnsupportedFormat() throws Exception {
        long id = deck(student, "FLASHCARD");
        em.flush();
        mvc.perform(get("/api/v1/student/decks/" + id + "/export?format=docx").with(as(student)))
                .andExpect(status().isBadRequest());
    }
}
