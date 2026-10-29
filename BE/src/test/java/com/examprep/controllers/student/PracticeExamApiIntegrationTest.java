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
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import static com.examprep.controllers.student.Fixtures.as;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** PQ-01..04. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class PracticeExamApiIntegrationTest {
    @Autowired MockMvc mvc;
    @Autowired EntityManager em;
    @Autowired ObjectMapper json;
    Fixtures f;
    User student, other, manager;
    Course course;
    Module oop, io;
    Set<Long> easyOop = new HashSet<>();

    @BeforeEach void setUp() {
        f = new Fixtures(em);
        manager = f.account(User.ROLE_COURSE_MANAGER);
        student = f.account(User.ROLE_STUDENT);
        other = f.account(User.ROLE_STUDENT);
        course = f.course(manager);
        f.enroll(student, course);
        oop = f.module(course, "OOP");
        io = f.module(course, "IO");
        for (int i = 0; i < 10; i++) easyOop.add(f.question(course, oop, "EASY").getQuestionId());
        for (int i = 0; i < 3; i++) f.question(course, oop, "HARD");
        for (int i = 0; i < 3; i++) f.question(course, io, "EASY");
        Question draft = f.question(course, oop, "EASY");
        draft.setStatus("DRAFT");
        Question pending = f.question(course, oop, "EASY");
        pending.setApprovalStatus("PENDING");
        Question essay = Question.builder().course(course).module(oop).questionType("ESSAY").difficulty("EASY").content("essay").build();
        em.persist(essay);
        em.flush();
    }

    @Test void createDrawsMatchingPublishedQuestions() throws Exception {
        JsonNode data = data(create(student, "{\"courseId\":" + course.getCourseId() + ",\"questionCount\":10,\"durationMinutes\":30,"
                + "\"difficulty\":\"EASY\",\"categoryIds\":[" + oop.getModuleId() + "],\"examType\":\"FINAL\"}")
                .andExpect(status().isCreated()).andExpect(jsonPath("$.message").value("Practice exam created")));
        assertEquals(10, data.path("questionCount").asInt());
        assertEquals(30, data.path("durationMinutes").asInt());
        assertTrue(data.path("title").asText().contains("Cuối kỳ"));
        Exam exam = em.find(Exam.class, data.path("examId").asLong());
        assertEquals("PRACTICE", exam.getMode());
        assertEquals("PUBLISHED", exam.getStatus());
        assertEquals(student.getUserId(), exam.getCreatedBy().getUserId());
        assertEquals(data.path("practiceId").asLong(), exam.getPracticeExamId());
        Set<Long> drawn = new HashSet<>(em.createQuery("select eq.question.questionId from ExamQuestion eq where eq.exam = :e", Long.class)
                .setParameter("e", exam).getResultList());
        assertEquals(easyOop, drawn);
        mvc.perform(post("/api/v1/student/exams/" + exam.getExamId() + "/attempts").with(as(student))).andExpect(status().isCreated());
    }

    @Test void notEnoughQuestions422() throws Exception {
        create(student, "{\"courseId\":" + course.getCourseId() + ",\"questionCount\":11,\"durationMinutes\":30,\"difficulty\":\"EASY\","
                + "\"categoryIds\":[" + oop.getModuleId() + "]}")
                .andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.data.code").value("NOT_ENOUGH_QUESTIONS"))
                .andExpect(jsonPath("$.data.available").value(10));
    }

    @Test void boundsValidation400() throws Exception {
        String c = "\"courseId\":" + course.getCourseId();
        create(student, "{" + c + ",\"questionCount\":4,\"durationMinutes\":30}").andExpect(status().isBadRequest());
        create(student, "{" + c + ",\"questionCount\":101,\"durationMinutes\":30}").andExpect(status().isBadRequest());
        create(student, "{" + c + ",\"questionCount\":5,\"durationMinutes\":0}").andExpect(status().isBadRequest());
        create(student, "{" + c + ",\"questionCount\":5,\"durationMinutes\":181}").andExpect(status().isBadRequest());
        create(student, "{" + c + ",\"questionCount\":5,\"durationMinutes\":10,\"difficulty\":\"X\"}").andExpect(status().isBadRequest());
        create(student, "{" + c + ",\"questionCount\":5,\"durationMinutes\":10,\"examType\":\"QUIZ\"}").andExpect(status().isBadRequest());
        create(student, "{\"questionCount\":5,\"durationMinutes\":10}").andExpect(status().isBadRequest());
        Course foreign = f.course(manager);
        Module foreignModule = f.module(foreign, "Other");
        create(student, "{" + c + ",\"questionCount\":5,\"durationMinutes\":10,\"categoryIds\":[" + foreignModule.getModuleId() + "]}")
                .andExpect(status().isBadRequest());
    }

    @Test void notEnrolled403() throws Exception {
        create(other, "{\"courseId\":" + course.getCourseId() + ",\"questionCount\":5,\"durationMinutes\":10}").andExpect(status().isForbidden());
    }

    @Test void listShowsBestScoreAndCountAndDeleteKeepsAttempts() throws Exception {
        JsonNode created = data(create(student, "{\"courseId\":" + course.getCourseId() + ",\"questionCount\":5,\"durationMinutes\":10}"));
        Exam exam = em.find(Exam.class, created.path("examId").asLong());
        f.finishedAttempt(exam, student, Instant.now(), "4.5");
        ExamAttempt best = f.finishedAttempt(exam, student, Instant.now(), "8");
        em.flush();
        mvc.perform(get("/api/v1/student/practice-exams").param("size", "10").with(as(student)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.totalElements").value(1))
                .andExpect(jsonPath("$.data.content[0].practiceId").value(created.path("practiceId").asLong()))
                .andExpect(jsonPath("$.data.content[0].bestScore").value(8.0))
                .andExpect(jsonPath("$.data.content[0].attemptCount").value(2))
                .andExpect(jsonPath("$.data.content[0].questionCount").value(5));
        mvc.perform(get("/api/v1/student/practice-exams").with(as(other))).andExpect(jsonPath("$.data.totalElements").value(0));

        long practiceId = created.path("practiceId").asLong();
        mvc.perform(delete("/api/v1/student/practice-exams/" + practiceId).with(as(other))).andExpect(status().isForbidden());
        mvc.perform(delete("/api/v1/student/practice-exams/" + practiceId).with(as(student)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.message").value("Deleted"));
        mvc.perform(delete("/api/v1/student/practice-exams/" + practiceId).with(as(student))).andExpect(status().isNotFound());
        em.flush();
        em.clear();
        assertNotNull(em.find(ExamAttempt.class, best.getAttemptId()));
        assertEquals("ARCHIVED", em.find(Exam.class, exam.getExamId()).getStatus());
    }

    @Test void wrongQuestionsHideAnswers() throws Exception {
        Exam exam = f.exam(course, oop, manager, "EXAM");
        List<Question> qs = em.createQuery("select q from Question q where q.module = :m and q.difficulty = 'HARD'", Question.class)
                .setParameter("m", oop).getResultList();
        ExamAttempt attempt = f.finishedAttempt(exam, student, Instant.now(), "1");
        f.answer(attempt, qs.get(0), true);
        f.answer(attempt, qs.get(1), false);
        f.answer(attempt, qs.get(2), false);
        String body = mvc.perform(get("/api/v1/student/attempts/" + attempt.getAttemptId() + "/wrong-questions").with(as(student)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.length()").value(2))
                .andExpect(jsonPath("$.data[0].questionId").value(qs.get(1).getQuestionId()))
                .andExpect(jsonPath("$.data[0].options.length()").value(2))
                .andReturn().getResponse().getContentAsString();
        assertFalse(body.contains("correctOptionIds"));
        assertFalse(body.contains("selectedOptionIds"));
        mvc.perform(get("/api/v1/student/attempts/" + attempt.getAttemptId() + "/wrong-questions").with(as(other))).andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/student/attempts/" + Long.MAX_VALUE + "/wrong-questions").with(as(student))).andExpect(status().isNotFound());
        attempt.setStatus("IN_PROGRESS");
        em.flush();
        mvc.perform(get("/api/v1/student/attempts/" + attempt.getAttemptId() + "/wrong-questions").with(as(student)))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.data.code").value("ATTEMPT_NOT_SUBMITTED"));
    }

    ResultActions create(User actor, String body) throws Exception {
        return mvc.perform(post("/api/v1/student/practice-exams").with(as(actor)).contentType(MediaType.APPLICATION_JSON).content(body));
    }

    JsonNode data(ResultActions result) throws Exception {
        return json.readTree(result.andReturn().getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8)).path("data");
    }
}
