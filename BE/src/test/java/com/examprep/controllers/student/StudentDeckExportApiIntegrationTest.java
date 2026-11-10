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

import java.time.Instant;

import static com.examprep.controllers.student.Fixtures.as;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Student PDF deck export (same access rules as reading/studying a deck). */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class StudentDeckExportApiIntegrationTest {
    @Autowired MockMvc mvc;
    @Autowired EntityManager em;
    Fixtures f;
    User student, other, manager;

    @BeforeEach
    void setUp() {
        f = new Fixtures(em);
        manager = f.account(User.ROLE_COURSE_MANAGER);
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

    private void assertValidPdf(byte[] pdf, String expectedText) throws Exception {
        assertTrue(new String(pdf, 0, 5, java.nio.charset.StandardCharsets.US_ASCII).equals("%PDF-"));
        try (PDDocument document = Loader.loadPDF(pdf)) {
            assertTrue(new PDFTextStripper().getText(document).contains(expectedText));
        }
    }

    private byte[] performExport(long deckId, User actor, String query) throws Exception {
        return mvc.perform(get("/api/v1/student/decks/" + deckId + "/export" + query).with(as(actor)))
                .andExpect(status().isOk())
                .andExpect(content().contentType(MediaType.APPLICATION_PDF))
                .andExpect(header().string("Content-Disposition",
                        org.hamcrest.Matchers.matchesPattern("attachment; filename=\".*\\.pdf\"")))
                .andReturn().getResponse().getContentAsByteArray();
    }

    @Test
    void exportOwnDeckStreamsPdf() throws Exception {
        long id = deck(student, "FLASHCARD");
        card(id, 1, "Photosynthesis", "Quang hợp", null, null);
        card(id, 2, "Loop in Java", "Repeat a block", "JAVA", "for(;;){}");
        em.flush();

        byte[] pdf = performExport(id, student, "");
        assertValidPdf(pdf, "Quang hợp");
    }

    @Test
    void exportCourseDeckAllowsActiveEnrollmentAndRejectsOthers() throws Exception {
        Course course = f.course(manager);
        f.enroll(student, course);
        User cancelled = f.account(User.ROLE_STUDENT);
        em.persist(Enrollment.builder().course(course).user(cancelled).status(Enrollment.STATUS_CANCELLED)
                .enrolledAt(Instant.now()).cancelledAt(Instant.now()).build());
        Deck courseDeck = Deck.builder().user(manager).course(course).title("Course deck")
                .mode("FLASHCARD").isPublic(true).visibility(Deck.VISIBILITY_PUBLIC).build();
        em.persist(courseDeck);
        card(courseDeck.getDeckId(), 1, "Inheritance", "Tính kế thừa", null, null);
        em.flush();

        byte[] pdf = performExport(courseDeck.getDeckId(), student, "?format=pdf");
        assertValidPdf(pdf, "Tính kế thừa");

        mvc.perform(get("/api/v1/student/decks/" + courseDeck.getDeckId() + "/export?format=pdf").with(as(other)))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/student/decks/" + courseDeck.getDeckId() + "/export?format=pdf").with(as(cancelled)))
                .andExpect(status().isForbidden());
    }

    @Test
    void exportApprovedPublicStudentDeckAllowsOthersWhilePrivateCourseAttachedStaysForbidden() throws Exception {
        Course course = f.course(manager);
        f.enroll(other, course);

        Deck approvedPublic = Deck.builder().user(student).course(course).title("Public deck")
                .mode("FLASHCARD").isPublic(true).visibility(Deck.VISIBILITY_PUBLIC).reviewStatus("APPROVED").build();
        em.persist(approvedPublic);
        card(approvedPublic.getDeckId(), 1, "Polymorphism", "Đa hình", null, null);

        Deck privateCourseAttached = Deck.builder().user(student).course(course).title("Private course deck")
                .mode("FLASHCARD").isPublic(false).visibility(Deck.VISIBILITY_PRIVATE).reviewStatus("NONE").build();
        em.persist(privateCourseAttached);
        card(privateCourseAttached.getDeckId(), 1, "Secret", "Bí mật", null, null);
        em.flush();

        byte[] pdf = performExport(approvedPublic.getDeckId(), other, "");
        assertValidPdf(pdf, "Đa hình");

        mvc.perform(get("/api/v1/student/decks/" + privateCourseAttached.getDeckId() + "/export").with(as(other)))
                .andExpect(status().isForbidden());
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
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.data.code").value("INVALID_FORMAT"));
    }
}
