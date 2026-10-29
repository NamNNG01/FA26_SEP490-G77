package com.examprep.controllers.student;

import com.examprep.entities.*;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.transaction.annotation.Transactional;

import static com.examprep.controllers.student.Fixtures.as;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** FC-01..06 and FC-10. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class StudentDeckApiIntegrationTest {
    @Autowired MockMvc mvc;
    @Autowired EntityManager em;
    @Autowired ObjectMapper json;
    Fixtures f;
    User student, other, manager;
    Course course;

    @BeforeEach void setUp() {
        f = new Fixtures(em);
        manager = f.account(User.ROLE_COURSE_MANAGER);
        student = f.account(User.ROLE_STUDENT);
        other = f.account(User.ROLE_STUDENT);
        course = f.course(manager);
        f.enroll(student, course);
        em.flush();
    }

    @Test void createDeckIsPrivateAndNone() throws Exception {
        send(post("/api/v1/student/decks"), student, "{\"title\":\" OOP words \",\"mode\":\"FLASHCARD\",\"visibility\":\"PUBLIC\",\"courseId\":" + course.getCourseId() + "}")
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.title").value("OOP words"))
                .andExpect(jsonPath("$.data.mode").value("FLASHCARD"))
                .andExpect(jsonPath("$.data.cardCount").value(0))
                .andExpect(jsonPath("$.data.visibility").value("PRIVATE"))
                .andExpect(jsonPath("$.data.reviewStatus").value("NONE"))
                .andExpect(jsonPath("$.data.courseId").value(course.getCourseId()))
                .andExpect(jsonPath("$.data.createdAt").exists());
    }

    @Test void createDeckRejectsLongTitleAndBadMode() throws Exception {
        send(post("/api/v1/student/decks"), student, "{\"title\":\"" + "x".repeat(151) + "\",\"mode\":\"FLASHCARD\"}").andExpect(status().isBadRequest());
        send(post("/api/v1/student/decks"), student, "{\"title\":\"ok\",\"mode\":\"X\"}").andExpect(status().isBadRequest());
        send(post("/api/v1/student/decks"), student, "{\"title\":\"  \",\"mode\":\"FLASHCARD\"}").andExpect(status().isBadRequest());
        send(post("/api/v1/student/decks"), student, "{\"title\":\"ok\",\"mode\":\"FLASHCARD\",\"description\":\"" + "d".repeat(501) + "\"}").andExpect(status().isBadRequest());
    }

    @Test void createDeckInNotEnrolledCourse403() throws Exception {
        send(post("/api/v1/student/decks"), other, "{\"title\":\"t\",\"mode\":\"FLASHCARD\",\"courseId\":" + course.getCourseId() + "}")
                .andExpect(status().isForbidden());
    }

    @Test void otherStudentCannotEditOrDelete403() throws Exception {
        long deck = deck(student, "FLASHCARD");
        long card = card(deck, "{\"frontText\":\"a\",\"backText\":\"b\"}");
        send(put("/api/v1/student/decks/" + deck), other, "{\"title\":\"x\"}").andExpect(status().isForbidden());
        mvc.perform(delete("/api/v1/student/decks/" + deck).with(as(other))).andExpect(status().isForbidden());
        send(post("/api/v1/student/decks/" + deck + "/cards"), other, "{\"frontText\":\"a\",\"backText\":\"b\"}").andExpect(status().isForbidden());
        send(put("/api/v1/student/cards/" + card), other, "{\"frontText\":\"z\"}").andExpect(status().isForbidden());
        mvc.perform(delete("/api/v1/student/cards/" + card).with(as(other))).andExpect(status().isForbidden());
        mvc.perform(delete("/api/v1/student/decks/" + Long.MAX_VALUE).with(as(student))).andExpect(status().isNotFound());
        mvc.perform(delete("/api/v1/student/cards/" + Long.MAX_VALUE).with(as(student))).andExpect(status().isNotFound());
    }

    @Test void courseDeckContentIsReadOnly403() throws Exception {
        Deck courseDeck = Deck.builder().user(manager).course(course).title("Course deck").isPublic(false).build();
        em.persist(courseDeck);
        Flashcard card = Flashcard.builder().deck(courseDeck).frontText("f").backText("b").position(1).build();
        em.persist(card);
        em.flush();
        send(put("/api/v1/student/decks/" + courseDeck.getDeckId()), student, "{\"title\":\"mine\"}").andExpect(status().isForbidden());
        send(post("/api/v1/student/decks/" + courseDeck.getDeckId() + "/cards"), student, "{\"frontText\":\"a\",\"backText\":\"b\"}").andExpect(status().isForbidden());
        send(put("/api/v1/student/cards/" + card.getCardId()), student, "{\"frontText\":\"z\"}").andExpect(status().isForbidden());
        mvc.perform(delete("/api/v1/student/cards/" + card.getCardId()).with(as(student))).andExpect(status().isForbidden());
    }

    @Test void cardFieldsFollowDeckMode() throws Exception {
        long code = deck(student, "CODE_SNIPPET");
        send(post("/api/v1/student/decks/" + code + "/cards"), student, "{\"frontText\":\"loop\",\"codeBody\":\"for(;;){}\"}").andExpect(status().isBadRequest());
        send(post("/api/v1/student/decks/" + code + "/cards"), student, "{\"frontText\":\"loop\",\"codeLanguage\":\"RUST\",\"codeBody\":\"x\"}").andExpect(status().isBadRequest());
        send(post("/api/v1/student/decks/" + code + "/cards"), student, "{\"frontText\":\"loop\",\"codeLanguage\":\"JAVA\",\"codeBody\":\"for(;;){}\"}")
                .andExpect(status().isCreated()).andExpect(jsonPath("$.data.position").value(1))
                .andExpect(jsonPath("$.data.codeLanguage").value("JAVA"));
        send(post("/api/v1/student/decks/" + code + "/cards"), student, "{\"frontText\":\"if\",\"codeLanguage\":\"python\",\"codeBody\":\"if x: pass\"}")
                .andExpect(status().isCreated()).andExpect(jsonPath("$.data.position").value(2))
                .andExpect(jsonPath("$.data.codeLanguage").value("PYTHON"));

        long output = deck(student, "CODE_OUTPUT");
        send(post("/api/v1/student/decks/" + output + "/cards"), student, "{\"codeBody\":\"print(1)\"}").andExpect(status().isBadRequest());
        long text = deck(student, "FLASHCARD");
        send(post("/api/v1/student/decks/" + text + "/cards"), student, "{\"frontText\":\"a\"}").andExpect(status().isBadRequest());
        long card = card(text, "{\"frontText\":\"a\",\"backText\":\"b\"}");
        send(put("/api/v1/student/cards/" + card), student, "{\"backText\":\"  \"}").andExpect(status().isBadRequest());
        send(put("/api/v1/student/cards/" + card), student, "{\"backText\":\"new back\"}")
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.frontText").value("a"))
                .andExpect(jsonPath("$.data.backText").value("new back"));
        // A deck with cards cannot switch layout.
        send(put("/api/v1/student/decks/" + text), student, "{\"mode\":\"CODE_OUTPUT\"}").andExpect(status().isConflict());
    }

    @Test void deleteDeckRemovesCardsAndProgress() throws Exception {
        long deck = deck(student, "FLASHCARD");
        long card = card(deck, "{\"frontText\":\"a\",\"backText\":\"b\"}");
        em.persist(UserCardProgress.builder().user(student).card(em.find(Flashcard.class, card)).isStarred(false).status("KNOWN").build());
        em.flush();
        mvc.perform(delete("/api/v1/student/decks/" + deck).with(as(student)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.message").value("Deleted"));
        em.clear();
        assertEquals(0L, em.createQuery("select count(p) from UserCardProgress p", Long.class).getSingleResult());
        assertEquals(null, em.find(Flashcard.class, card));
    }

    @Test void publishRequestTransitions() throws Exception {
        long deck = deck(student, "FLASHCARD");
        mvc.perform(post("/api/v1/student/decks/" + deck + "/publish-request").with(as(student))).andExpect(status().isUnprocessableEntity());
        card(deck, "{\"frontText\":\"a\",\"backText\":\"b\"}");
        mvc.perform(post("/api/v1/student/decks/" + deck + "/publish-request").with(as(other))).andExpect(status().isForbidden());
        mvc.perform(post("/api/v1/student/decks/" + deck + "/publish-request").with(as(student)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.message").value("Sent for review"))
                .andExpect(jsonPath("$.data.visibility").value("PRIVATE"))
                .andExpect(jsonPath("$.data.reviewStatus").value("PENDING_REVIEW"))
                .andExpect(jsonPath("$.data.submittedAt").exists());
        mvc.perform(post("/api/v1/student/decks/" + deck + "/publish-request").with(as(student)))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.data.code").value("ALREADY_PENDING_REVIEW"));

        Deck entity = em.find(Deck.class, deck);
        entity.setReviewStatus("REJECTED");
        entity.setReviewNote("Too short");
        em.flush();
        send(put("/api/v1/student/decks/" + deck), student, "{\"description\":\"longer now\"}")
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.reviewStatus").value("REJECTED"))
                .andExpect(jsonPath("$.data.reviewNote").value("Too short"));
        mvc.perform(post("/api/v1/student/decks/" + deck + "/publish-request").with(as(student)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.reviewStatus").value("PENDING_REVIEW"));

        entity.setReviewStatus("APPROVED");
        entity.setVisibility("PUBLIC");
        em.flush();
        mvc.perform(post("/api/v1/student/decks/" + deck + "/publish-request").with(as(student)))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.data.code").value("ALREADY_PUBLIC"));
    }

    @Test void classmatesDoNotSeePrivateCourseAttachedDeck() throws Exception {
        f.enroll(other, course);
        em.flush();
        String body = send(post("/api/v1/student/decks"), student, "{\"title\":\"Mine\",\"mode\":\"FLASHCARD\",\"courseId\":" + course.getCourseId() + "}")
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        long deck = json.readTree(body).path("data").path("deckId").asLong();
        mvc.perform(get("/api/v1/student/courses/" + course.getCourseId() + "/decks").with(as(other)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.length()").value(0));
        mvc.perform(get("/api/v1/student/decks/" + deck + "/cards").with(as(other))).andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/student/courses/" + course.getCourseId() + "/decks").with(as(student)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.length()").value(1));
    }

    long deck(User owner, String mode) throws Exception {
        String body = send(post("/api/v1/student/decks"), owner, "{\"title\":\"Deck " + System.nanoTime() + "\",\"mode\":\"" + mode + "\"}")
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        return json.readTree(body).path("data").path("deckId").asLong();
    }

    long card(long deck, String body) throws Exception {
        String reply = send(post("/api/v1/student/decks/" + deck + "/cards"), student, body)
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        JsonNode data = json.readTree(reply).path("data");
        return data.path("cardId").asLong();
    }

    ResultActions send(org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder request, User actor, String body) throws Exception {
        return mvc.perform(request.with(as(actor)).contentType(MediaType.APPLICATION_JSON).content(body));
    }
}
