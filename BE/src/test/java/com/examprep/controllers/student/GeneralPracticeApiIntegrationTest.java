package com.examprep.controllers.student;

import com.examprep.entities.Question;
import com.examprep.entities.User;
import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;

import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Module Practice for a course's General pool: the questions of the course that are filed under no
 * module ({@code questions.module_id IS NULL}).
 *
 * <p>The fixture adds three practisable module-less questions to the base class's course, so the
 * module overviews stay at their documented counts while the General pool is non-empty. The General
 * scope must never see a module's question, a module scope must never see a General one, and the reset
 * of one must leave the other alone.</p>
 */
class GeneralPracticeApiIntegrationTest extends ModulePracticeTestBase {

    private final List<Question> generalQuestions = new ArrayList<>();

    @BeforeEach
    void generalPool() {
        for (int i = 1; i <= 3; i++) {
            Question general = Question.builder().course(course).module(null).questionType("SINGLE_CHOICE")
                    .content("General question " + i).status("ACTIVE").approvalStatus("APPROVED").build();
            em.persist(general);
            option(general, "right", true, 0);
            option(general, "wrong", false, 1);
            generalQuestions.add(general);
        }
        // Not deliverable, exactly like the ineligible module questions of the base fixture.
        em.persist(Question.builder().course(course).module(null).questionType("SINGLE_CHOICE")
                .content("Draft general question").status("DRAFT").approvalStatus("APPROVED").build());
        em.flush();
    }

    @Test
    void overviewCoversExactlyTheCoursesQuestionsWithoutAModule() throws Exception {
        JsonNode general = data(generalOverview(student).andExpect(status().isOk()));
        assertTrue(blank(general.path("moduleId")), "a General overview has no module");
        assertEquals("General", general.path("moduleTitle").asText());
        assertEquals(course.getCourseId(), general.path("courseId").asLong());
        assertEquals(course.getTitle(), general.path("courseTitle").asText());
        assertEquals(generalQuestions.size(), general.path("totalQuestions").asInt());
        assertEquals(generalQuestions.size(), general.path("unpracticedQuestions").asInt());
        assertEquals(0, general.path("practicedQuestions").asInt());
        assertTrue(blank(general.path("activeSession")));

        JsonNode module = data(overview(student, moduleA.getModuleId()).andExpect(status().isOk()));
        assertEquals(9, module.path("totalQuestions").asInt(), "the General pool never inflates a module");
    }

    @Test
    void aGeneralSessionDrawsOnlyModuleLessQuestionsAndIsResumed() throws Exception {
        JsonNode created = data(generalStart(student, "{\"mode\":\"ALL\",\"questionCount\":2}")
                .andExpect(status().isCreated()));
        long sessionId = created.path("sessionId").asLong();
        assertTrue(blank(created.path("moduleId")));
        assertEquals("General", created.path("moduleTitle").asText());
        assertEquals(course.getCourseId(), created.path("courseId").asLong());
        assertEquals(2, created.path("questionCount").asInt());
        assertFalse(created.path("resumed").asBoolean());
        assertEquals(0, count("SELECT COUNT(q) FROM QuestionPracticeSessionQuestion q "
                        + "WHERE q.session.sessionId = " + sessionId + " AND q.question.module IS NOT NULL"),
                "a General paper never draws a module's question");
        assertEquals(0, count("SELECT COUNT(s) FROM QuestionPracticeSession s "
                + "WHERE s.sessionId = " + sessionId + " AND s.module IS NOT NULL"));

        // MP-03 reads the same General session back.
        JsonNode resumed = resume(student, sessionId);
        assertEquals(sessionId, resumed.path("sessionId").asLong());
        assertTrue(blank(resumed.path("moduleId")));
        assertEquals("General", resumed.path("moduleTitle").asText());

        // MP-02 resumes it instead of opening a second run…
        JsonNode again = data(generalStart(student, "{}").andExpect(status().isOk()));
        assertEquals(sessionId, again.path("sessionId").asLong());
        assertTrue(again.path("resumed").asBoolean());

        // …while a module run of the same course is a different scope, in both directions.
        JsonNode moduleSession = data(startSession(student, moduleA.getModuleId(), "{}")
                .andExpect(status().isCreated()));
        assertNotEquals(sessionId, moduleSession.path("sessionId").asLong());
        assertEquals(moduleA.getModuleId(), moduleSession.path("moduleId").asLong());
        assertEquals(sessionId, data(generalStart(student, "{}").andExpect(status().isOk()))
                .path("sessionId").asLong(), "the module run did not replace the General one");
    }

    @Test
    void answeringAGeneralQuestionWritesGeneralProgressOnly() throws Exception {
        JsonNode session = data(generalStart(student, "{\"mode\":\"ALL\"}").andExpect(status().isCreated()));
        long sessionId = session.path("sessionId").asLong();
        Question target = generalQuestions.get(0);
        // One wrong attempt, so MP-11 has a row to list.
        answer(student, sessionId, sessionQuestionIdOf(session, target.getQuestionId()),
                "{\"response\":{\"selectedOptionIds\":[" + optionId(target, false) + "]}}");

        JsonNode general = data(generalOverview(student).andExpect(status().isOk()));
        assertEquals(1, general.path("practicedQuestions").asInt());
        assertEquals(1, general.path("totalAttempts").asInt());
        assertEquals(1, general.path("wrongAttempts").asInt());
        assertEquals(1, general.path("questionsNeedingReview").asInt());
        assertEquals(sessionId, general.path("activeSession").path("sessionId").asLong());

        assertEquals(1, count("SELECT COUNT(p) FROM QuestionPracticeProgress p "
                + "WHERE p.course.courseId = " + course.getCourseId() + " AND p.module IS NULL"));
        assertEquals(0, count("SELECT COUNT(p) FROM QuestionPracticeProgress p WHERE p.module IS NOT NULL"),
                "answering in the General pool writes no module progress row");

        JsonNode module = data(overview(student, moduleA.getModuleId()).andExpect(status().isOk()));
        assertEquals(0, module.path("practicedQuestions").asInt(), "module overviews are unchanged");
        assertEquals(0, module.path("totalAttempts").asInt());

        // MP-08 reports the General scope.
        JsonNode generalResult = data(result(student, sessionId).andExpect(status().isOk()));
        assertTrue(blank(generalResult.path("moduleId")));
        assertEquals("General", generalResult.path("moduleTitle").asText());

        // MP-11 lists it under the General scope, flagged as such.
        JsonNode review = data(generalReview(student, 0, 20).andExpect(status().isOk()));
        assertEquals(1, review.path("totalElements").asInt());
        JsonNode item = review.path("content").get(0);
        assertEquals(target.getQuestionId(), item.path("questionId").asLong());
        assertTrue(blank(item.path("moduleId")));
        assertEquals("General", item.path("moduleTitle").asText());
        // A module review list of the same course never shows a General question.
        JsonNode moduleReview = data(reviewQuestions(student, moduleA.getModuleId(), 0, 20)
                .andExpect(status().isOk()));
        assertEquals(0, moduleReview.path("totalElements").asInt());
    }

    @Test
    void resetClearsOnlyTheGeneralPoolOfTheCourse() throws Exception {
        JsonNode session = data(generalStart(student, "{}").andExpect(status().isCreated()));
        long sessionId = session.path("sessionId").asLong();
        Question target = generalQuestions.get(0);
        answer(student, sessionId, sessionQuestionIdOf(session, target.getQuestionId()),
                "{\"response\":{\"selectedOptionIds\":[" + optionId(target, false) + "]}}");

        JsonNode moduleSession = sessionOf(student, moduleB.getModuleId());
        Question moduleTarget = moduleBQuestions.get(0);
        answer(student, moduleSession.path("sessionId").asLong(),
                sessionQuestionIdOf(moduleSession, moduleTarget.getQuestionId()),
                "{\"response\":{\"selectedOptionIds\":[" + optionId(moduleTarget, true) + "]}}");

        JsonNode reset = data(generalReset(student).andExpect(status().isOk()));
        assertTrue(blank(reset.path("moduleId")));
        assertEquals("General", reset.path("moduleTitle").asText());
        assertEquals(1, reset.path("deletedSessions").asInt());
        assertEquals(1, reset.path("deletedProgressRecords").asInt());

        assertEquals(0, count("SELECT COUNT(s) FROM QuestionPracticeSession s "
                + "WHERE s.course.courseId = " + course.getCourseId() + " AND s.module IS NULL"));
        assertEquals(0, count("SELECT COUNT(p) FROM QuestionPracticeProgress p WHERE p.module IS NULL"));
        // The module run of the same course survives with its progress.
        assertEquals(1, count("SELECT COUNT(s) FROM QuestionPracticeSession s WHERE s.module.moduleId = "
                + moduleB.getModuleId()));
        assertEquals(1, count("SELECT COUNT(p) FROM QuestionPracticeProgress p WHERE p.module.moduleId = "
                + moduleB.getModuleId()));

        // A clean slate: the General pool can be practised from scratch again.
        JsonNode fresh = data(generalStart(student, "{}").andExpect(status().isCreated()));
        assertEquals(generalQuestions.size(), fresh.path("questionCount").asInt());
        assertEquals(0, fresh.path("answeredCount").asInt());
    }

    @Test
    void studentsWithoutAnActiveEnrollmentAreRefusedEverywhere() throws Exception {
        generalOverview(otherStudent).andExpect(status().isForbidden());
        generalStart(otherStudent, "{}").andExpect(status().isForbidden());
        generalReview(otherStudent, 0, 20).andExpect(status().isForbidden());
        generalReset(otherStudent).andExpect(status().isForbidden());

        em.createQuery("UPDATE Enrollment e SET e.status = 'SUSPENDED' WHERE e.user.userId = :userId "
                        + "AND e.course.courseId = :courseId")
                .setParameter("userId", brokeStudent.getUserId())
                .setParameter("courseId", course.getCourseId())
                .executeUpdate();
        generalOverview(brokeStudent).andExpect(status().isForbidden());
        generalStart(brokeStudent, "{}").andExpect(status().isForbidden());

        // An unknown course is a 404, exactly as an unknown module is.
        mvc.perform(get("/api/v1/student/courses/{courseId}/general/practice/overview", 999_999L)
                        .with(user(principal(student))))
                .andExpect(status().isNotFound());
    }

    // ------------------------------------------------------------------ helpers

    private ResultActions generalOverview(User who) throws Exception {
        return mvc.perform(get("/api/v1/student/courses/{courseId}/general/practice/overview",
                        course.getCourseId())
                .with(user(principal(who))));
    }

    private ResultActions generalStart(User who, String body) throws Exception {
        return mvc.perform(post("/api/v1/student/courses/{courseId}/general/practice/sessions",
                        course.getCourseId())
                .with(user(principal(who)))
                .contentType(MediaType.APPLICATION_JSON)
                .content(body == null ? "{}" : body));
    }

    private ResultActions generalReview(User who, int page, int size) throws Exception {
        return mvc.perform(get("/api/v1/student/courses/{courseId}/general/practice/review-questions",
                        course.getCourseId())
                .with(user(principal(who)))
                .param("page", String.valueOf(page))
                .param("size", String.valueOf(size)));
    }

    private ResultActions generalReset(User who) throws Exception {
        return mvc.perform(delete("/api/v1/student/courses/{courseId}/general/practice/progress",
                        course.getCourseId())
                .with(user(principal(who))));
    }

    private long optionId(Question question, boolean correct) {
        return em.createQuery("SELECT o.optionId FROM AnswerOption o "
                        + "WHERE o.question.questionId = :questionId AND o.isCorrect = :correct", Long.class)
                .setParameter("questionId", question.getQuestionId())
                .setParameter("correct", correct)
                .getSingleResult();
    }
}
