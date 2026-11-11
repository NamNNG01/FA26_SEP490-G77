package com.examprep.controllers.student;

import com.examprep.entities.*;
import com.examprep.entities.Module;
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
import org.springframework.transaction.annotation.Transactional;

import javax.sql.DataSource;
import java.sql.Connection;
import java.time.Instant;
import java.time.temporal.ChronoUnit;

import static com.examprep.controllers.student.Fixtures.as;
import static org.hamcrest.Matchers.lessThanOrEqualTo;
import static org.hamcrest.Matchers.greaterThanOrEqualTo;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Automated versions of the Report 5.1 unit test cases that were only checked by hand before
 * (UTC321, UTC324, UTC691-UTC695, UTC758, UTC885-UTC903, UTC942). Each test names its UTC id.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class UnitTestGapApiIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired EntityManager em;
    @Autowired ObjectMapper json;
    @Autowired DataSource dataSource;

    Fixtures f;
    User manager, student, other;
    Course course;
    Module module;

    @BeforeEach
    void setUp() throws Exception {
        try (Connection c = dataSource.getConnection()) {
            Fixtures.aliasAdvisoryLock(c);
        }
        f = new Fixtures(em);
        manager = f.account(User.ROLE_COURSE_MANAGER);
        student = f.account(User.ROLE_STUDENT);
        other = f.account(User.ROLE_STUDENT);
        course = f.course(manager);
        module = f.module(course, "M1");
        f.enroll(student, course);
        f.enroll(other, course);
        em.flush();
    }

    // ------------------------------------------------------------------ Student Module

    /** UTC321 - MC-04 deck cards of an enrolled course, with the student's progress fields. */
    @Test
    void utc321_listDeckCardsOfEnrolledCourse() throws Exception {
        Deck deck = Deck.builder().user(manager).course(course).title("OOP deck").isPublic(true).build();
        em.persist(deck);
        em.persist(Flashcard.builder().deck(deck).frontText("What is OOP?").backText("Object oriented programming").position(1).build());
        em.flush();

        mvc.perform(get("/api/v1/student/decks/" + deck.getDeckId() + "/cards").param("page", "0").param("size", "20").with(as(student)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalElements").value(1))
                .andExpect(jsonPath("$.data.content[0].frontText").value("What is OOP?"))
                .andExpect(jsonPath("$.data.content[0].cardId").exists());
    }

    /** UTC324 - EX-02 active attempt: running attempt is returned, no attempt gives an empty body. */
    @Test
    void utc324_activeAttemptReturnsRunningAttemptOrNothing() throws Exception {
        Exam exam = f.exam(course, module, manager, "EXAM");
        Exam untouched = f.exam(course, module, manager, "EXAM");
        Instant now = Instant.now();
        ExamAttempt running = ExamAttempt.builder().exam(exam).user(student).startTime(now.minus(5, ChronoUnit.MINUTES))
                .deadlineAt(now.plus(25, ChronoUnit.MINUTES)).status("IN_PROGRESS").examSnapshot("{\"maxScore\":10,\"title\":\"x\"}").build();
        em.persist(running);
        em.flush();

        mvc.perform(get("/api/v1/student/exams/" + exam.getExamId() + "/active-attempt").with(as(student)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.attemptId").value(running.getAttemptId()))
                .andExpect(jsonPath("$.data.status").value("IN_PROGRESS"))
                .andExpect(jsonPath("$.data.deadlineAt").exists())
                .andExpect(jsonPath("$.data.maxScore").value(10));

        mvc.perform(get("/api/v1/student/exams/" + untouched.getExamId() + "/active-attempt").with(as(student)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data").doesNotExist());
    }

    // ------------------------------------------------------------------ Learning Progress Service

    /** UTC691 - LP-01 course without exams and decks: progress 0, no average, no recent attempts. */
    @Test
    void utc691_emptyCourseProgressIsZero() throws Exception {
        Course empty = f.course(manager);
        f.enroll(student, empty);
        em.flush();

        mvc.perform(get("/api/v1/student/progress/courses/" + empty.getCourseId()).with(as(student)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.progress").value(0))
                .andExpect(jsonPath("$.data.averageScore").doesNotExist())
                .andExpect(jsonPath("$.data.recentAttempts").isEmpty());
    }

    /** UTC692 - LP-01 one exam taken three times: progress stays within 0..100. */
    @Test
    void utc692_repeatedAttemptsDoNotPushProgressOver100() throws Exception {
        Exam exam = f.exam(course, module, manager, "EXAM");
        Instant now = Instant.now();
        for (int i = 1; i <= 3; i++) {
            f.finishedAttempt(exam, student, now.minus(i, ChronoUnit.HOURS), "8");
        }
        em.flush();

        mvc.perform(get("/api/v1/student/progress/courses/" + course.getCourseId()).with(as(student)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.progress").value(lessThanOrEqualTo(100)))
                .andExpect(jsonPath("$.data.progress").value(greaterThanOrEqualTo(0)));
    }

    /** UTC694 - LP-02 FLASHCARD activity type returns an empty page. */
    @Test
    void utc694_flashcardActivityTypeIsAnEmptyPage() throws Exception {
        Exam exam = f.exam(course, module, manager, "EXAM");
        f.finishedAttempt(exam, student, Instant.now().minus(1, ChronoUnit.HOURS), "7");
        em.flush();

        mvc.perform(get("/api/v1/student/progress/activities").param("type", "FLASHCARD").with(as(student)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content").isEmpty())
                .andExpect(jsonPath("$.data.totalElements").value(0));
    }

    /** UTC695 - LP-02 size=0 is a validation error, not a server error. */
    @Test
    void utc695_activityPageSizeZeroIsBadRequest() throws Exception {
        mvc.perform(get("/api/v1/student/progress/activities").param("size", "0").with(as(student)))
                .andExpect(status().isBadRequest());
    }

    /** UTC942 - LP-02 without a token is rejected with 401. */
    @Test
    void utc942_activityHistoryRequiresAuthentication() throws Exception {
        mvc.perform(get("/api/v1/student/progress/activities"))
                .andExpect(status().isUnauthorized());
    }

    // ------------------------------------------------------------------ Student Deck Service

    /** UTC758 - FC-06 deleting a card of an own private deck removes the card and its progress. */
    @Test
    void utc758_deleteCardRemovesCardAndProgress() throws Exception {
        Deck deck = Deck.builder().user(student).title("My deck").isPublic(false).build();
        em.persist(deck);
        Flashcard first = Flashcard.builder().deck(deck).frontText("A").backText("1").position(1).build();
        Flashcard second = Flashcard.builder().deck(deck).frontText("B").backText("2").position(2).build();
        em.persist(first);
        em.persist(second);
        em.persist(UserCardProgress.builder().user(student).card(first).status("KNOWN").isStarred(false).wrongCount(0).build());
        em.flush();

        mvc.perform(delete("/api/v1/student/cards/" + first.getCardId()).with(as(student)))
                .andExpect(status().isOk());
        em.flush();
        em.clear();

        long cards = em.createQuery("select count(c) from Flashcard c where c.deck.deckId = :d", Long.class)
                .setParameter("d", deck.getDeckId()).getSingleResult();
        long progress = em.createQuery("select count(p) from UserCardProgress p where p.card.cardId = :c", Long.class)
                .setParameter("c", first.getCardId()).getSingleResult();
        assertEquals(1, cards);
        assertEquals(0, progress);
    }

    // ------------------------------------------------------------------ Mistake Notebook Service

    private StudentQuestionReview review(User owner, Question q, String status, boolean bookmark, int wrongCount) {
        StudentQuestionReview r = StudentQuestionReview.builder().student(owner).question(q).status(status).bookmark(bookmark)
                .wrongCount(wrongCount).firstWrongAt(Instant.now().minus(2, ChronoUnit.DAYS))
                .lastPracticedAt(Instant.now().minus(1, ChronoUnit.DAYS)).build();
        em.persist(r);
        return r;
    }

    private JsonNode data(String url) throws Exception {
        String body = mvc.perform(get(url).with(as(student))).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return json.readTree(body).path("data");
    }

    /** UTC885 - MN-01 type=wrong lists only the wrong item. */
    @Test
    void utc885_wrongFilterListsOnlyWrongItems() throws Exception {
        Question wrong = f.question(course, module, "EASY");
        Question bookmarkedOnly = f.question(course, module, "EASY");
        review(student, wrong, "WRONG_BOOKMARKED", false, 2);
        review(student, bookmarkedOnly, "ANSWERED_BOOKMARKED", true, 0);
        em.flush();

        JsonNode page = data("/api/v1/student/questions/saved?type=wrong");
        assertEquals(1, page.path("totalElements").asInt());
        assertEquals(wrong.getQuestionId(), page.path("content").get(0).path("questionId").asLong());
        assertEquals(true, page.path("content").get(0).path("wrong").asBoolean());
    }

    /** UTC886 - MN-01 a 150-character search is cut to 100 characters. */
    @Test
    void utc886_searchIsTruncatedTo100Characters() throws Exception {
        String hundred = "n".repeat(100);
        Question q = f.question(course, module, "EASY");
        q.setContent(hundred + " tail");
        review(student, q, "WRONG_BOOKMARKED", false, 1);
        em.flush();

        JsonNode page = data("/api/v1/student/questions/saved?search=" + hundred + "z".repeat(50));
        assertEquals(1, page.path("totalElements").asInt(), "only the first 100 characters are used for the search");
        assertEquals(q.getQuestionId(), page.path("content").get(0).path("questionId").asLong());
    }

    /** UTC887 - MN-01 examType + categoryId filters are both applied. */
    @Test
    void utc887_examTypeAndCategoryFiltersAreApplied() throws Exception {
        Course otherCourse = f.course(manager);
        Module otherModule = f.module(otherCourse, "M2");
        Question quiz = f.question(course, module, "EASY");
        Question essay = f.question(course, module, "EASY");
        essay.setQuestionType("ESSAY");
        Question otherCategory = f.question(otherCourse, otherModule, "EASY");
        review(student, quiz, "WRONG_BOOKMARKED", false, 1);
        review(student, essay, "WRONG_BOOKMARKED", false, 1);
        review(student, otherCategory, "WRONG_BOOKMARKED", false, 1);
        em.flush();

        JsonNode page = data("/api/v1/student/questions/saved?examType=QUIZ&categoryId=" + course.getCategoryId());
        assertEquals(1, page.path("totalElements").asInt());
        assertEquals(quiz.getQuestionId(), page.path("content").get(0).path("questionId").asLong());
    }

    /** UTC888 - MN-01 size=0 is a validation error, not a server error. */
    @Test
    void utc888_savedListPageSizeZeroIsBadRequest() throws Exception {
        mvc.perform(get("/api/v1/student/questions/saved").param("size", "0").with(as(student)))
                .andExpect(status().isBadRequest());
    }

    /** UTC892 - MN-02 bookmarking a question that does not exist answers 404. */
    @Test
    void utc892_bookmarkUnknownQuestionIsNotFound() throws Exception {
        mvc.perform(post("/api/v1/student/questions/" + Long.MAX_VALUE + "/bookmark").with(as(student)))
                .andExpect(status().isNotFound());
    }

    /** UTC893 - MN-03 another student gets 404, the owner can delete the row. */
    @Test
    void utc893_onlyOwnerCanDeleteSavedQuestion() throws Exception {
        Question q = f.question(course, module, "EASY");
        StudentQuestionReview r = review(student, q, "WRONG_BOOKMARKED", true, 1);
        em.flush();

        mvc.perform(delete("/api/v1/student/questions/saved/" + r.getReviewId()).with(as(other)))
                .andExpect(status().isNotFound());
        mvc.perform(delete("/api/v1/student/questions/saved/" + r.getReviewId()).with(as(student)))
                .andExpect(status().isOk());
    }

    private String reviewBody(String type, int size) {
        return "{\"courseId\":" + course.getCourseId() + ",\"type\":\"" + type + "\",\"size\":" + size + ",\"durationMinutes\":15}";
    }

    /** UTC895 - MN-04 review session: submit, result and acknowledge all succeed. */
    @Test
    void utc895_reviewSessionCanBeSubmittedReviewedAndAcknowledged() throws Exception {
        Question q = f.question(course, module, "EASY");
        review(student, q, "WRONG_BOOKMARKED", true, 2);
        em.flush();

        String started = mvc.perform(post("/api/v1/student/questions/review-session").with(as(student))
                        .contentType(MediaType.APPLICATION_JSON).content(reviewBody("wrong", 1)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        long attemptId = json.readTree(started).path("data").path("attemptId").asLong();

        mvc.perform(post("/api/v1/student/attempts/" + attemptId + "/submit").with(as(student)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("COMPLETED"));
        mvc.perform(get("/api/v1/student/attempts/" + attemptId + "/result").with(as(student)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.examMode").value("PRACTICE_EXAM"));
        mvc.perform(post("/api/v1/student/attempts/" + attemptId + "/review-acknowledged").with(as(student)))
                .andExpect(status().isOk());
    }

    /** UTC896 - MN-04 size above 50 is rejected. */
    @Test
    void utc896_reviewSessionSizeAbove50IsBadRequest() throws Exception {
        mvc.perform(post("/api/v1/student/questions/review-session").with(as(student))
                        .contentType(MediaType.APPLICATION_JSON).content(reviewBody("bookmarked", 100)))
                .andExpect(status().isBadRequest());
    }

    /** UTC897 - MN-04 size 0 is rejected. */
    @Test
    void utc897_reviewSessionSizeZeroIsBadRequest() throws Exception {
        mvc.perform(post("/api/v1/student/questions/review-session").with(as(student))
                        .contentType(MediaType.APPLICATION_JSON).content(reviewBody("wrong", 0)))
                .andExpect(status().isBadRequest());
    }

    /** UTC903 - MN-05 an out-of-range limit falls back to 5 items. */
    @Test
    void utc903_weakSpotsLimitOutOfRangeFallsBackToFive() throws Exception {
        for (int i = 0; i < 7; i++) {
            review(student, f.question(course, module, "EASY"), "WRONG_BOOKMARKED", false, i + 1);
        }
        em.flush();

        JsonNode list = data("/api/v1/student/questions/weak-spots?limit=50");
        assertEquals(5, list.size());
    }
}
