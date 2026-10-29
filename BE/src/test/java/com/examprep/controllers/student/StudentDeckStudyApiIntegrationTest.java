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
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;

import static com.examprep.controllers.student.Fixtures.as;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** FC-08, FC-09, FP-01..03, FV-01 on a manager's course deck. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class StudentDeckStudyApiIntegrationTest {
    @Autowired MockMvc mvc;
    @Autowired EntityManager em;
    @Autowired ObjectMapper json;
    Fixtures f;
    User student, outsider, manager;
    Deck deck;
    List<Flashcard> cards = new ArrayList<>();

    @BeforeEach void setUp() {
        f = new Fixtures(em);
        manager = f.account(User.ROLE_COURSE_MANAGER);
        student = f.account(User.ROLE_STUDENT);
        outsider = f.account(User.ROLE_STUDENT);
        Course course = f.course(manager);
        f.enroll(student, course);
        deck = Deck.builder().user(manager).course(course).title("Course deck").isPublic(false).build();
        em.persist(deck);
        for (int i = 1; i <= 6; i++) {
            Flashcard c = Flashcard.builder().deck(deck).frontText("front " + i).backText("back " + i).position(i).build();
            em.persist(c);
            cards.add(c);
        }
        em.flush();
    }

    @Test void progressWrongIncrementsAndStaysLearning() throws Exception {
        progress(cards.get(0), "{\"status\":\"WRONG\"}").andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("LEARNING")).andExpect(jsonPath("$.data.wrongCount").value(1));
        progress(cards.get(0), "{\"status\":\"WRONG\",\"isStarred\":true}").andExpect(status().isOk())
                .andExpect(jsonPath("$.data.wrongCount").value(2)).andExpect(jsonPath("$.data.isStarred").value(true))
                .andExpect(jsonPath("$.data.totalCards").value(6)).andExpect(jsonPath("$.data.learnedCount").value(0));
        // LEARNING never downgrades KNOWN.
        progress(cards.get(1), "{\"status\":\"KNOWN\"}").andExpect(jsonPath("$.data.status").value("KNOWN"));
        progress(cards.get(1), "{\"status\":\"LEARNING\"}").andExpect(jsonPath("$.data.status").value("KNOWN"));
    }

    @Test void progressKnownCompletesDeck() throws Exception {
        for (int i = 0; i < 5; i++) progress(cards.get(i), "{\"status\":\"KNOWN\"}").andExpect(jsonPath("$.data.deckLearned").value(false));
        progress(cards.get(5), "{\"status\":\"KNOWN\"}").andExpect(status().isOk())
                .andExpect(jsonPath("$.data.deckLearned").value(true)).andExpect(jsonPath("$.data.learnedCount").value(6));
    }

    @Test void progressNeedsAField400() throws Exception {
        progress(cards.get(0), "{}").andExpect(status().isBadRequest());
        progress(cards.get(0), "{\"status\":\"DONE\"}").andExpect(status().isBadRequest());
        mvc.perform(put("/api/v1/student/cards/" + Long.MAX_VALUE + "/progress").with(as(student))
                .contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"KNOWN\"}")).andExpect(status().isNotFound());
    }

    @Test void progressOnCourseDeckNeedsEnrollment403() throws Exception {
        send(put("/api/v1/student/cards/" + cards.get(0).getCardId() + "/progress"), outsider, "{\"status\":\"KNOWN\"}").andExpect(status().isForbidden());
        mvc.perform(put("/api/v1/student/decks/" + deck.getDeckId() + "/learn-all").with(as(outsider))).andExpect(status().isForbidden());
        send(post("/api/v1/student/decks/" + deck.getDeckId() + "/study-sessions"), outsider, "{\"mode\":\"PRACTICE\"}").andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/student/decks/" + deck.getDeckId() + "/viewer").with(as(outsider))).andExpect(status().isForbidden());
    }

    @Test void learnAllKeepsExisting() throws Exception {
        progress(cards.get(0), "{\"status\":\"WRONG\"}");
        mvc.perform(put("/api/v1/student/decks/" + deck.getDeckId() + "/learn-all").with(as(student)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.learnedCount").value(5))
                .andExpect(jsonPath("$.data.totalCards").value(6)).andExpect(jsonPath("$.data.deckLearned").value(false));
        em.clear();
        assertEquals("LEARNING", em.createQuery("select p.status from UserCardProgress p where p.card.cardId = :c", String.class)
                .setParameter("c", cards.get(0).getCardId()).getSingleResult());
    }

    @Test void sessionOrdersNewLearningKnown() throws Exception {
        Instant now = Instant.now();
        state(cards.get(0), "KNOWN", 3, now.minus(1, ChronoUnit.DAYS));
        state(cards.get(1), "LEARNING", 1, now.minus(2, ChronoUnit.DAYS));
        state(cards.get(2), "LEARNING", 4, now.minus(1, ChronoUnit.DAYS));
        state(cards.get(3), "LEARNING", 1, now.minus(5, ChronoUnit.DAYS));
        // cards 4 and 5 are NEW
        JsonNode data = data(send(post("/api/v1/student/decks/" + deck.getDeckId() + "/study-sessions"), student, "{\"mode\":\"LEARN\"}")
                .andExpect(status().isCreated()).andExpect(jsonPath("$.message").value("Study session started")));
        List<Long> order = new ArrayList<>();
        data.path("cards").forEach(c -> order.add(c.path("cardId").asLong()));
        assertEquals(List.of(id(4), id(5), id(2), id(3), id(1), id(0)), order);
        assertEquals(6, data.path("totalCards").asInt());
        assertEquals("NEW", data.path("cards").get(0).path("status").asText());
        assertEquals("Course deck", data.path("deckTitle").asText());

        JsonNode limited = data(send(post("/api/v1/student/decks/" + deck.getDeckId() + "/study-sessions"), student, "{\"mode\":\"PRACTICE\",\"cardLimit\":2}"));
        assertEquals(2, limited.path("cards").size());
        assertEquals(2, limited.path("totalCards").asInt());
        send(post("/api/v1/student/decks/" + deck.getDeckId() + "/study-sessions"), student, "{\"mode\":\"QUIZ\"}").andExpect(status().isBadRequest());
        send(post("/api/v1/student/decks/" + deck.getDeckId() + "/study-sessions"), student, "{\"mode\":\"LEARN\",\"cardLimit\":-1}").andExpect(status().isBadRequest());
    }

    @Test void finishSessionCountsBodyIdsOfThisDeckOnly() throws Exception {
        String session = data(send(post("/api/v1/student/decks/" + deck.getDeckId() + "/study-sessions"), student, "{\"mode\":\"PRACTICE\"}"))
                .path("sessionId").asText();
        send(post("/api/v1/student/study-sessions/" + session + "/finish"), student,
                "{\"knownCardIds\":[" + id(0) + "," + id(1) + "," + id(1) + "," + Long.MAX_VALUE + "],\"wrongCardIds\":[" + id(2) + "]}")
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.totalCards").value(6))
                .andExpect(jsonPath("$.data.knownCount").value(2)).andExpect(jsonPath("$.data.wrongCount").value(1));
    }

    @Test void finishWithoutBodyUsesProgressSinceStart() throws Exception {
        String session = data(send(post("/api/v1/student/decks/" + deck.getDeckId() + "/study-sessions"), student, "{\"mode\":\"PRACTICE\"}"))
                .path("sessionId").asText();
        progress(cards.get(0), "{\"status\":\"KNOWN\"}");
        progress(cards.get(1), "{\"status\":\"WRONG\"}");
        mvc.perform(post("/api/v1/student/study-sessions/" + session + "/finish").with(as(student)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.knownCount").value(1)).andExpect(jsonPath("$.data.wrongCount").value(1));
    }

    @Test void finishTwice409AndOthers404() throws Exception {
        String session = data(send(post("/api/v1/student/decks/" + deck.getDeckId() + "/study-sessions"), student, "{\"mode\":\"PRACTICE\"}"))
                .path("sessionId").asText();
        mvc.perform(post("/api/v1/student/study-sessions/" + session + "/finish").with(as(outsider))).andExpect(status().isNotFound());
        mvc.perform(post("/api/v1/student/study-sessions/ps-nope/finish").with(as(student))).andExpect(status().isNotFound());
        mvc.perform(post("/api/v1/student/study-sessions/" + session + "/finish").with(as(student))).andExpect(status().isOk());
        mvc.perform(post("/api/v1/student/study-sessions/" + session + "/finish").with(as(student))).andExpect(status().isConflict());
    }

    @Test void reviewCardsLimitBoundsAndOrder() throws Exception {
        Instant now = Instant.now();
        state(cards.get(0), "LEARNING", 1, now);
        state(cards.get(1), "LEARNING", 5, now);
        state(cards.get(2), "KNOWN", 9, now);
        mvc.perform(get("/api/v1/student/decks/" + deck.getDeckId() + "/review-cards").param("limit", "0").with(as(student))).andExpect(status().isBadRequest());
        mvc.perform(get("/api/v1/student/decks/" + deck.getDeckId() + "/review-cards").param("limit", "51").with(as(student))).andExpect(status().isBadRequest());
        mvc.perform(get("/api/v1/student/decks/" + deck.getDeckId() + "/review-cards").with(as(student)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.length()").value(2))
                .andExpect(jsonPath("$.data[0].cardId").value(id(1))).andExpect(jsonPath("$.data[0].wrongCount").value(5));
    }

    @Test void viewerHasNoProgressAndWritesNothing() throws Exception {
        state(cards.get(0), "KNOWN", 0, Instant.now());
        mvc.perform(get("/api/v1/student/decks/" + deck.getDeckId() + "/viewer").param("cardLimit", "3").with(as(student)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.cards.length()").value(3))
                .andExpect(jsonPath("$.data.cards[0].status").doesNotExist())
                .andExpect(jsonPath("$.data.cards[0].cardId").value(id(0)))
                .andExpect(jsonPath("$.data.deckMode").value("FLASHCARD"));
        em.flush();
        assertEquals(1L, em.createQuery("select count(p) from UserCardProgress p", Long.class).getSingleResult());
    }

    long id(int index) { return cards.get(index).getCardId(); }

    void state(Flashcard card, String status, int wrong, Instant reviewed) {
        em.persist(UserCardProgress.builder().user(student).card(card).isStarred(false).status(status).wrongCount(wrong).lastReviewedAt(reviewed).build());
        em.flush();
    }

    ResultActions progress(Flashcard card, String body) throws Exception {
        return send(put("/api/v1/student/cards/" + card.getCardId() + "/progress"), student, body);
    }

    JsonNode data(ResultActions result) throws Exception {
        return json.readTree(result.andReturn().getResponse().getContentAsString()).path("data");
    }

    ResultActions send(MockHttpServletRequestBuilder request, User actor, String body) throws Exception {
        return mvc.perform(request.with(as(actor)).contentType(MediaType.APPLICATION_JSON).content(body));
    }
}
