package com.examprep.controllers;

import com.examprep.controllers.student.Fixtures;
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
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Manager PDF deck export (F-03 access rules). */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class ManagerDeckExportApiIntegrationTest {
    @Autowired MockMvc mvc;
    @Autowired EntityManager em;
    Fixtures f;
    User manager, admin, student;
    Course course;
    long deckId;

    @BeforeEach
    void setUp() {
        f = new Fixtures(em);
        manager = f.account(User.ROLE_COURSE_MANAGER);
        admin = f.account(User.ROLE_ADMIN);
        student = f.account(User.ROLE_STUDENT);
        course = f.course(manager);
        Deck deck = Deck.builder().user(manager).course(course).title("Photosynthesis").isPublic(false).build();
        em.persist(deck);
        em.persist(Flashcard.builder().deck(deck).frontText("Photosynthesis").backText("Quang hợp").position(1).build());
        deckId = deck.getDeckId();
        em.flush();
    }

    @Test
    void managerExportsCourseDeckPdf() throws Exception {
        byte[] pdf = mvc.perform(get("/api/v1/manager/decks/" + deckId + "/export").with(as(manager)))
                .andExpect(status().isOk())
                .andExpect(content().contentType(MediaType.APPLICATION_PDF))
                .andReturn().getResponse().getContentAsByteArray();
        assertTrue(new String(pdf, 0, 5, java.nio.charset.StandardCharsets.US_ASCII).equals("%PDF-"));
        try (PDDocument document = Loader.loadPDF(pdf)) {
            assertTrue(new PDFTextStripper().getText(document).contains("Quang hợp"));
        }
    }

    @Test
    void adminCanExportToo() throws Exception {
        mvc.perform(get("/api/v1/manager/decks/" + deckId + "/export").with(as(admin))).andExpect(status().isOk());
    }

    @Test
    void studentCannotExport403() throws Exception {
        mvc.perform(get("/api/v1/manager/decks/" + deckId + "/export").with(as(student))).andExpect(status().isForbidden());
    }

    @Test
    void unknownDeck404AndBadFormat400() throws Exception {
        mvc.perform(get("/api/v1/manager/decks/" + Long.MAX_VALUE + "/export").with(as(manager))).andExpect(status().isNotFound());
        mvc.perform(get("/api/v1/manager/decks/" + deckId + "/export?format=docx").with(as(manager))).andExpect(status().isBadRequest());
    }
}
