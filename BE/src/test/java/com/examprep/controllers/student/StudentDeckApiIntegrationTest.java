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

/** FC-01..06, FC-10 and FC-12..15. */
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

    // ------------------------------------------------------------------ FC-14 / FC-15 / DECK_LOCKED

    @Test void detailShowsOwnProgressAndHidesReviewNoteFromOthers() throws Exception {
        String body = send(post("/api/v1/student/decks"), student, "{\"title\":\"Shared\",\"mode\":\"FLASHCARD\",\"courseId\":" + course.getCourseId() + "}")
                .andExpect(status().isCreated()).andExpect(jsonPath("$.data.courseTitle").value(course.getTitle()))
                .andReturn().getResponse().getContentAsString();
        long deck = json.readTree(body).path("data").path("deckId").asLong();
        long card = card(deck, "{\"frontText\":\"a\",\"backText\":\"b\"}");
        card(deck, "{\"frontText\":\"c\",\"backText\":\"d\"}");
        em.persist(UserCardProgress.builder().user(student).card(em.find(Flashcard.class, card)).isStarred(true).status("KNOWN").build());
        Deck entity = em.find(Deck.class, deck);
        entity.setReviewStatus("APPROVED");
        entity.setVisibility("PUBLIC");
        entity.setReviewNote("internal note");
        em.flush();

        mvc.perform(get("/api/v1/student/decks/" + deck).with(as(student)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.isOwner").value(true))
                .andExpect(jsonPath("$.data.courseTitle").value(course.getTitle()))
                .andExpect(jsonPath("$.data.ownerName").value(student.getFullName()))
                .andExpect(jsonPath("$.data.cardCount").value(2)).andExpect(jsonPath("$.data.learnedCount").value(1))
                .andExpect(jsonPath("$.data.starredCount").value(1)).andExpect(jsonPath("$.data.reviewNote").value("internal note"));
        mvc.perform(get("/api/v1/student/decks/" + deck).with(as(other)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.isOwner").value(false))
                .andExpect(jsonPath("$.data.learnedCount").value(0)).andExpect(jsonPath("$.data.reviewNote").isEmpty());
        long privateDeck = deck(student, "FLASHCARD");
        mvc.perform(get("/api/v1/student/decks/" + privateDeck).with(as(other))).andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/student/decks/" + Long.MAX_VALUE).with(as(student))).andExpect(status().isNotFound());
    }

    @Test void withdrawReviewTransitions() throws Exception {
        long deck = deck(student, "FLASHCARD");
        card(deck, "{\"frontText\":\"a\",\"backText\":\"b\"}");
        String path = "/api/v1/student/decks/" + deck + "/withdraw-review";
        mvc.perform(post(path).with(as(student))).andExpect(status().isConflict()).andExpect(jsonPath("$.data.code").value("NOT_PENDING_REVIEW"));
        mvc.perform(post("/api/v1/student/decks/" + deck + "/publish-request").with(as(student))).andExpect(status().isOk());
        mvc.perform(post(path).with(as(other))).andExpect(status().isForbidden());
        mvc.perform(post(path).with(as(student)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.message").value("Review request withdrawn"))
                .andExpect(jsonPath("$.data.reviewStatus").value("NONE")).andExpect(jsonPath("$.data.visibility").value("PRIVATE"))
                .andExpect(jsonPath("$.data.submittedAt").isEmpty());
        Deck entity = em.find(Deck.class, deck);
        entity.setReviewStatus("APPROVED");
        entity.setVisibility("PUBLIC");
        em.flush();
        mvc.perform(post(path).with(as(student))).andExpect(status().isConflict()).andExpect(jsonPath("$.data.code").value("ALREADY_PUBLIC"));
    }

    @Test void pendingOrPublicDeckIsLocked() throws Exception {
        long deck = deck(student, "FLASHCARD");
        long card = card(deck, "{\"frontText\":\"a\",\"backText\":\"b\"}");
        mvc.perform(post("/api/v1/student/decks/" + deck + "/publish-request").with(as(student))).andExpect(status().isOk());
        send(put("/api/v1/student/decks/" + deck), student, "{\"title\":\"x\"}").andExpect(status().isConflict()).andExpect(jsonPath("$.data.code").value("DECK_LOCKED"));
        send(post("/api/v1/student/decks/" + deck + "/cards"), student, "{\"frontText\":\"c\",\"backText\":\"d\"}").andExpect(status().isConflict());
        send(put("/api/v1/student/cards/" + card), student, "{\"frontText\":\"z\"}").andExpect(status().isConflict());
        mvc.perform(delete("/api/v1/student/cards/" + card).with(as(student))).andExpect(status().isConflict());
        send(put("/api/v1/student/cards/" + card + "/progress"), student, "{\"status\":\"KNOWN\"}").andExpect(status().isOk());

        Deck entity = em.find(Deck.class, deck);
        entity.setReviewStatus("APPROVED");
        entity.setVisibility("PUBLIC");
        em.flush();
        mvc.perform(delete("/api/v1/student/decks/" + deck).with(as(student)))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.data.code").value("DECK_LOCKED"));

        long pending = deck(student, "FLASHCARD");
        card(pending, "{\"frontText\":\"a\",\"backText\":\"b\"}");
        mvc.perform(post("/api/v1/student/decks/" + pending + "/publish-request").with(as(student))).andExpect(status().isOk());
        mvc.perform(delete("/api/v1/student/decks/" + pending).with(as(student))).andExpect(status().isOk());
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

    // ------------------------------------------------------------------ FC-13

    @Test void listMineShowsOnlyOwnDecksWithFilters() throws Exception {
        long flash = deck(student, "FLASHCARD");
        long code = deck(student, "CODE_SNIPPET");
        deck(other, "FLASHCARD");
        card(flash, "{\"frontText\":\"a\",\"backText\":\"b\"}");
        mvc.perform(get("/api/v1/student/decks?scope=MINE").with(as(student)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalElements").value(2))
                .andExpect(jsonPath("$.data.content[?(@.deckId == " + flash + ")].cardCount").value(1))
                .andExpect(jsonPath("$.data.content[?(@.deckId == " + flash + ")].ownerId").value(student.getUserId().intValue()))
                .andExpect(jsonPath("$.data.content[?(@.deckId == " + flash + ")].reviewStatus").value("NONE"));
        mvc.perform(get("/api/v1/student/decks?scope=MINE&mode=FLASHCARD").with(as(student)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalElements").value(1))
                .andExpect(jsonPath("$.data.content[0].deckId").value(flash));
        send(put("/api/v1/student/decks/" + code), student, "{\"title\":\"Java 100%_words\"}").andExpect(status().isOk());
        mvc.perform(get("/api/v1/student/decks?scope=MINE").param("search", "100%_").with(as(student)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalElements").value(1))
                .andExpect(jsonPath("$.data.content[0].deckId").value(code));
    }

    @Test void listCourseShowsManagerAndPublicDecksButNotOwn() throws Exception {
        f.enroll(other, course);
        Deck managerDeck = Deck.builder().user(manager).course(course).title("Course deck").isPublic(false).build();
        em.persist(managerDeck);
        em.flush();
        String body = send(post("/api/v1/student/decks"), other, "{\"title\":\"Classmate\",\"mode\":\"FLASHCARD\",\"courseId\":" + course.getCourseId() + "}")
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        long classmate = json.readTree(body).path("data").path("deckId").asLong();
        send(post("/api/v1/student/decks"), student, "{\"title\":\"Mine\",\"mode\":\"FLASHCARD\",\"courseId\":" + course.getCourseId() + "}")
                .andExpect(status().isCreated());
        mvc.perform(get("/api/v1/student/decks?scope=COURSE").with(as(student)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalElements").value(1))
                .andExpect(jsonPath("$.data.content[0].deckId").value(managerDeck.getDeckId()))
                .andExpect(jsonPath("$.data.content[0].courseTitle").value(course.getTitle()));
        em.find(Deck.class, classmate).setVisibility("PUBLIC");
        em.flush();
        mvc.perform(get("/api/v1/student/decks?scope=COURSE&courseId=" + course.getCourseId()).with(as(student)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.totalElements").value(2));
    }

    @Test void listRejectsBadParams() throws Exception {
        User stranger = f.account(User.ROLE_STUDENT);
        em.flush();
        mvc.perform(get("/api/v1/student/decks").with(as(student))).andExpect(status().isBadRequest());
        mvc.perform(get("/api/v1/student/decks?scope=ALL").with(as(student))).andExpect(status().isBadRequest());
        mvc.perform(get("/api/v1/student/decks?scope=MINE&mode=X").with(as(student))).andExpect(status().isBadRequest());
        mvc.perform(get("/api/v1/student/decks?scope=MINE&size=101").with(as(student))).andExpect(status().isBadRequest());
        mvc.perform(get("/api/v1/student/decks?scope=COURSE&courseId=" + course.getCourseId()).with(as(stranger)))
                .andExpect(status().isForbidden());
    }

    // ------------------------------------------------------------------ FC-12

    @Test void cardFromSingleChoiceQuestion() throws Exception {
        var module = f.module(course, "OOP");
        Exam exam = f.exam(course, module, manager, "EXAM");
        Question q = f.question(course, module, "EASY");
        q.setAiExplanation("Because it is.");
        ExamAttempt attempt = f.finishedAttempt(exam, student, java.time.Instant.now(), "5");
        f.answer(attempt, q, false);
        long deck = deck(student, "FLASHCARD");
        String body = "{\"questionId\":" + q.getQuestionId() + ",\"attemptId\":" + attempt.getAttemptId() + "}";
        send(post("/api/v1/student/decks/" + deck + "/cards/from-question"), student, body)
                .andExpect(status().isCreated()).andExpect(jsonPath("$.message").value("Card created from question"))
                .andExpect(jsonPath("$.data.frontText").value(q.getContent()))
                .andExpect(jsonPath("$.data.backText").value("right\n\nBecause it is."))
                .andExpect(jsonPath("$.data.position").value(1))
                .andExpect(jsonPath("$.data.sourceQuestionId").value(q.getQuestionId()))
                .andExpect(jsonPath("$.data.sourceAttemptId").value(attempt.getAttemptId()));
        send(post("/api/v1/student/decks/" + deck + "/cards/from-question"), student, body)
                .andExpect(status().isConflict()).andExpect(jsonPath("$.data.code").value("ALREADY_EXISTS"))
                .andExpect(jsonPath("$.data.cardId").exists());
        long code = deck(student, "CODE_SNIPPET");
        send(post("/api/v1/student/decks/" + code + "/cards/from-question"), student, body).andExpect(status().isUnprocessableEntity());
    }

    @Test void cardFromEssayUsesFeedbackNotRubric() throws Exception {
        var module = f.module(course, "OOP");
        Exam exam = f.exam(course, module, manager, "EXAM");
        Question q = Question.builder().course(course).module(module).questionType("ESSAY").difficulty("EASY").content("Explain GC.")
                .essayGradingRubric("{\"criteria\":[{\"name\":\"secret rubric\"}]}").build();
        em.persist(q);
        ExamAttempt attempt = f.finishedAttempt(exam, student, java.time.Instant.now(), "5");
        em.persist(AttemptAnswer.builder().attempt(attempt).question(q).weightSnapshot(java.math.BigDecimal.ONE)
                .displaySnapshot("{\"content\":\"Explain GC.\"}").keySnapshot("{\"sampleAnswer\":\"Roots and reachability.\"}")
                .aiFeedbackJson("{\"overallFeedback\":\"Good on roots, missed generations.\"}").gradingStatus("AI_GRADED").build());
        Question q2 = Question.builder().course(course).module(module).questionType("ESSAY").difficulty("EASY").content("Explain JIT.").build();
        em.persist(q2);
        em.persist(AttemptAnswer.builder().attempt(attempt).question(q2).weightSnapshot(java.math.BigDecimal.ONE)
                .displaySnapshot("{\"content\":\"Explain JIT.\"}").keySnapshot("{\"sampleAnswer\":\"Compiles hot code.\"}").gradingStatus("PENDING").build());
        em.flush();
        long deck = deck(student, "FLASHCARD");
        send(post("/api/v1/student/decks/" + deck + "/cards/from-question"), student,
                "{\"questionId\":" + q.getQuestionId() + ",\"attemptId\":" + attempt.getAttemptId() + "}")
                .andExpect(status().isCreated()).andExpect(jsonPath("$.data.backText").value("Good on roots, missed generations."));
        send(post("/api/v1/student/decks/" + deck + "/cards/from-question"), student,
                "{\"questionId\":" + q2.getQuestionId() + ",\"attemptId\":" + attempt.getAttemptId() + "}")
                .andExpect(status().isCreated()).andExpect(jsonPath("$.data.backText").value("Compiles hot code."));
    }

    @Test void cardFromQuestionChecksAttempt() throws Exception {
        var module = f.module(course, "OOP");
        Exam exam = f.exam(course, module, manager, "EXAM");
        Question q = f.question(course, module, "EASY");
        Question notInAttempt = f.question(course, module, "EASY");
        ExamAttempt attempt = f.finishedAttempt(exam, student, java.time.Instant.now(), "5");
        f.answer(attempt, q, true);
        long deck = deck(student, "FLASHCARD");
        String path = "/api/v1/student/decks/" + deck + "/cards/from-question";
        send(post(path), student, "{\"questionId\":" + notInAttempt.getQuestionId() + ",\"attemptId\":" + attempt.getAttemptId() + "}").andExpect(status().isNotFound());
        send(post(path), student, "{\"questionId\":" + q.getQuestionId() + "}").andExpect(status().isBadRequest());
        attempt.setStatus("IN_PROGRESS");
        em.flush();
        send(post(path), student, "{\"questionId\":" + q.getQuestionId() + ",\"attemptId\":" + attempt.getAttemptId() + "}")
                .andExpect(status().isConflict()).andExpect(jsonPath("$.data.code").value("ATTEMPT_NOT_SUBMITTED"));
        attempt.setStatus("SUBMITTED");
        em.flush();
        long othersDeck = deck(other, "FLASHCARD");
        send(post("/api/v1/student/decks/" + othersDeck + "/cards/from-question"), other,
                "{\"questionId\":" + q.getQuestionId() + ",\"attemptId\":" + attempt.getAttemptId() + "}").andExpect(status().isNotFound());
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
