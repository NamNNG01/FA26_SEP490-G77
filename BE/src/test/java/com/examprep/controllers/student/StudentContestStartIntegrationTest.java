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
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.temporal.ChronoUnit;

import static com.examprep.controllers.student.Fixtures.as;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** CT-03 must freeze the paper so the take-exam screen (SA-02) can load it. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class StudentContestStartIntegrationTest {
    @Autowired MockMvc mvc;
    @Autowired EntityManager em;
    @Autowired ObjectMapper json;
    Fixtures f;
    User student;
    Contest contest;

    @BeforeEach void setUp() {
        f = new Fixtures(em);
        User manager = f.account(User.ROLE_COURSE_MANAGER);
        student = f.account(User.ROLE_STUDENT);
        Course course = f.course(manager);
        f.enroll(student, course);
        Module module = f.module(course, "M1");
        Exam exam = f.exam(course, module, manager, "EXAM");
        for (int i = 1; i <= 2; i++) {
            em.persist(ExamQuestion.builder().exam(exam).question(f.question(course, module, "EASY"))
                    .orderIndex(i).weight(BigDecimal.ONE).build());
        }
        Instant now = Instant.now();
        contest = Contest.builder().exam(exam).course(course).createdBy(manager).title("Live").durationMinutes(30)
                .startTime(now.minus(5, ChronoUnit.MINUTES)).endTime(now.plus(1, ChronoUnit.HOURS)).status("PUBLISHED").build();
        em.persist(contest);
        em.flush();
    }

    @Test void startedContestAttemptShowsItsQuestions() throws Exception {
        JsonNode started = data(post("/api/v1/student/contests/" + contest.getContestId() + "/start"));
        assertEquals(2, started.path("questions").size());

        JsonNode session = data(get("/api/v1/student/attempts/" + started.path("attemptId").asLong()));
        assertEquals("CONTEST", session.path("examMode").asText());
        assertEquals(2, session.path("questions").size());
        assertEquals(2, session.path("answers").size());
    }

    @Test void startingAgainReturnsTheSameFrozenPaper() throws Exception {
        JsonNode first = data(post("/api/v1/student/contests/" + contest.getContestId() + "/start"));
        JsonNode again = data(post("/api/v1/student/contests/" + contest.getContestId() + "/start"));
        assertEquals(first.path("attemptId").asLong(), again.path("attemptId").asLong());
        assertEquals(first.path("questions").get(0).path("questionId").asLong(), again.path("questions").get(0).path("questionId").asLong());
        assertEquals(2L, em.createQuery("select count(a) from AttemptAnswer a where a.attempt.attemptId = :id", Long.class)
                .setParameter("id", first.path("attemptId").asLong()).getSingleResult());
    }

    @Test void attemptStartedWithoutAPaperGetsOneOnResume() throws Exception {
        Instant now = Instant.now();
        ExamAttempt broken = ExamAttempt.builder().exam(contest.getExam()).user(student).mode("CONTEST").status("IN_PROGRESS")
                .startTime(now).deadlineAt(now.plus(30, ChronoUnit.MINUTES)).autoSubmitted(false).build();
        em.persist(broken);
        em.persist(ContestParticipant.builder().contest(contest).user(student).joinedAt(now).attemptId(broken.getAttemptId()).build());
        em.flush();

        JsonNode resumed = data(post("/api/v1/student/contests/" + contest.getContestId() + "/start"));
        assertEquals(broken.getAttemptId(), resumed.path("attemptId").asLong());
        assertEquals(2, data(get("/api/v1/student/attempts/" + broken.getAttemptId())).path("questions").size());
    }

    private JsonNode data(org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder request) throws Exception {
        String body = mvc.perform(request.with(as(student))).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return json.readTree(body).path("data");
    }
}
