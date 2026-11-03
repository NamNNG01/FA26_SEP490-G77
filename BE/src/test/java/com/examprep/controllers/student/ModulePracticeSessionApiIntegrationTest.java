package com.examprep.controllers.student;

import com.examprep.entities.Module;
import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** MP-01 … MP-04, MP-07, MP-08, MP-11: the session lifecycle, the frozen paper and authorisation. */
class ModulePracticeSessionApiIntegrationTest extends ModulePracticeTestBase {

    private static final int ELIGIBLE_IN_MODULE_A = 9;

    // ------------------------------------------------------------------ MP-01

    @Test
    void overviewCountsOnlyTheEligibleBankOfTheModule() throws Exception {
        JsonNode body = data(overview(student, moduleA.getModuleId()).andExpect(status().isOk()));

        assertEquals(moduleA.getModuleId(), body.path("moduleId").asLong());
        assertEquals("OOP", body.path("moduleTitle").asText());
        assertEquals(course.getCourseId(), body.path("courseId").asLong());
        assertEquals(ELIGIBLE_IN_MODULE_A, body.path("totalQuestions").asInt());
        assertEquals(0, body.path("practicedQuestions").asInt());
        assertEquals(ELIGIBLE_IN_MODULE_A, body.path("unpracticedQuestions").asInt());
        assertEquals(0, body.path("everCorrectQuestions").asInt());
        assertEquals(0, body.path("totalAttempts").asInt());
        assertEquals(0, body.path("gradedAttempts").asInt());
        assertEquals(0.0, body.path("accuracyRate").asDouble(), 1e-9);
        assertEquals(0, body.path("questionsNeedingReview").asInt());
        assertTrue(blank(body.path("activeSession")), "no open session means a null activeSession");
    }

    @Test
    void overviewReportsTheOpenSessionOfTheModule() throws Exception {
        JsonNode session = sessionOf(student, moduleA.getModuleId());

        JsonNode body = data(overview(student, moduleA.getModuleId()).andExpect(status().isOk()));
        assertEquals(session.path("sessionId").asLong(), body.path("activeSession").path("sessionId").asLong());
        assertEquals("IN_PROGRESS", body.path("activeSession").path("status").asText());
        assertEquals(ELIGIBLE_IN_MODULE_A, body.path("activeSession").path("questionCount").asInt());
        assertFalse(body.path("activeSession").path("nextSessionQuestionId").isNull());
    }

    @Test
    void aModuleWithoutQuestionsCannotStartAPractice() throws Exception {
        JsonNode body = data(overview(student, moduleC.getModuleId()).andExpect(status().isOk()));
        assertEquals(0, body.path("totalQuestions").asInt());
        assertEquals(0, body.path("practicedQuestions").asInt());

        var started = startSession(student, moduleC.getModuleId(), "{}");
        started.andExpect(status().isUnprocessableEntity());
        assertEquals("This module has no question available for practice", message(started));
        assertEquals(0, count("SELECT COUNT(s) FROM QuestionPracticeSession s"));
    }

    // ------------------------------------------------------------------ MP-02

    @Test
    void startFreezesTheWholePoolRandomlyOrderedWithoutDuplicates() throws Exception {
        JsonNode session = sessionOf(student, moduleA.getModuleId());

        assertEquals("IN_PROGRESS", session.path("status").asText());
        assertEquals("ALL", session.path("mode").asText());
        assertEquals(ELIGIBLE_IN_MODULE_A, session.path("questionCount").asInt());
        assertEquals(0, session.path("answeredCount").asInt());
        assertFalse(session.path("resumed").asBoolean());

        JsonNode questions = session.path("questions");
        assertEquals(ELIGIBLE_IN_MODULE_A, questions.size());
        Set<Long> ids = new HashSet<>();
        List<Integer> order = new ArrayList<>();
        for (JsonNode row : questions) {
            assertTrue(ids.add(row.path("questionId").asLong()), "a question appears twice in one paper");
            order.add(row.path("orderIndex").asInt());
            assertFalse(row.path("answered").asBoolean());
            assertEquals(0, row.path("attemptCount").asInt());
            assertEquals("UNANSWERED", row.path("gradingStatus").asText());
        }
        // The persisted order_index is gap-free and ascending; the FE navigates by it.
        for (int index = 0; index < order.size(); index++) {
            assertEquals(index, order.get(index));
        }
        assertFalse(ids.contains(questionIdByContent("Draft question")), "a DRAFT question was handed out");
        assertFalse(ids.contains(questionIdByContent("Archived question")), "an ARCHIVED question was handed out");
        assertFalse(ids.contains(questionIdByContent("Deleted question")), "a deleted question was handed out");
        assertFalse(ids.contains(questionIdByContent("Private material question")),
                "a question generated from another student's material was handed out");
        assertFalse(ids.contains(questionIdByContent("Pending approval")), "an unapproved question was handed out");
    }

    @Test
    void startingAgainResumesTheSameSessionWithTheSameOrder() throws Exception {
        JsonNode first = sessionOf(student, moduleA.getModuleId());
        List<Long> firstOrder = questionIdsOf(first);

        JsonNode second = sessionOf(student, moduleA.getModuleId());
        assertTrue(second.path("resumed").asBoolean(), "starting twice must resume, not create");
        assertEquals(first.path("sessionId").asLong(), second.path("sessionId").asLong());
        assertEquals(firstOrder, questionIdsOf(second), "the persisted order must never be re-randomized");
        assertEquals(1, count("SELECT COUNT(s) FROM QuestionPracticeSession s"));

        JsonNode resumedByGet = resume(student, first.path("sessionId").asLong());
        assertEquals(firstOrder, questionIdsOf(resumedByGet));
        assertFalse(resumedByGet.path("resumed").asBoolean(), "resuming by GET is not a start");
    }

    @Test
    void aRequestedQuestionCountIsHonouredAndCappedByThePool() throws Exception {
        JsonNode two = data(startSession(student, moduleB.getModuleId(), "{\"questionCount\":2}")
                .andExpect(status().isCreated()));
        assertEquals(2, two.path("questionCount").asInt());
        assertEquals(2, two.path("questions").size());
        assertEquals(2, new HashSet<>(questionIdsOf(two)).size());

        // Asking for more than the module holds returns everything it holds, not an error.
        JsonNode all = data(startSession(otherStudent, moduleE.getModuleId(), "{\"questionCount\":50}")
                .andExpect(status().isCreated()));
        assertEquals(1, all.path("questionCount").asInt());
    }

    @Test
    void anInvalidModeOrCountIsRejected() throws Exception {
        startSession(student, moduleB.getModuleId(), "{\"mode\":\"EVERYTHING\"}")
                .andExpect(status().isBadRequest());
        startSession(student, moduleB.getModuleId(), "{\"questionCount\":0}")
                .andExpect(status().isBadRequest());
        startSession(student, moduleB.getModuleId(), "{\"questionCount\":100000}")
                .andExpect(status().isBadRequest());
        assertEquals(0, count("SELECT COUNT(s) FROM QuestionPracticeSession s"));
    }

    @Test
    void reviewModeUsesOnlyTheQuestionsWhoseLatestAttemptIsWrong() throws Exception {
        JsonNode session = sessionOf(student, moduleB.getModuleId());
        long sessionId = session.path("sessionId").asLong();
        long sessionQuestionId = sessionQuestionIdOf(session, moduleBQuestions.get(0).getQuestionId());

        JsonNode view = data(questionView(student, sessionId, sessionQuestionId).andExpect(status().isOk()));
        answer(student, sessionId, sessionQuestionId, wrongAnswer(view));
        complete(student, sessionId).andExpect(status().isOk());

        JsonNode review = data(startSession(student, moduleB.getModuleId(), "{\"mode\":\"REVIEW\"}")
                .andExpect(status().isCreated()));
        assertEquals("REVIEW", review.path("mode").asText());
        assertEquals(1, review.path("questionCount").asInt());
        assertEquals(moduleBQuestions.get(0).getQuestionId(),
                review.path("questions").get(0).path("questionId").asLong());

        // Nothing needs review in a module where nothing is wrong.
        startSession(student, moduleA.getModuleId(), "{\"mode\":\"REVIEW\"}")
                .andExpect(status().isUnprocessableEntity());
    }

    // ------------------------------------------------------------------ MP-03 / MP-04

    @Test
    void aQuestionViewCarriesContentMediaAndPassageButNeverTheAnswerKey() throws Exception {
        JsonNode session = sessionOf(student, moduleA.getModuleId());
        long sessionId = session.path("sessionId").asLong();

        var singleRequest = questionView(student, sessionId, sessionQuestionIdOf(session, single.getQuestionId()));
        singleRequest.andExpect(status().isOk());
        JsonNode singleView = data(singleRequest);
        assertEquals("SINGLE_CHOICE", singleView.path("questionType").asText());
        assertEquals(single.getContent(), singleView.path("content").asText());
        assertEquals(2, singleView.path("options").size());
        Set<String> optionTexts = new HashSet<>();
        for (JsonNode option : singleView.path("options")) {
            optionTexts.add(option.path("optionText").asText());
            // An option must never carry its isCorrect flag to a student before they answer.
            assertFalse(option.has("isCorrect"), "an option leaked its isCorrect flag");
        }
        assertEquals(Set.of("extends", "implements"), optionTexts);
        assertEquals(1, singleView.path("media").size());
        assertEquals("/uploads/documents/class-diagram.png", singleView.path("media").get(0).path("url").asText());
        assertEquals(ELIGIBLE_IN_MODULE_A, singleView.path("questionsTotal").asInt());
        assertEquals(0, singleView.path("questionsAnswered").asInt());
        assertEquals("UNANSWERED", singleView.path("gradingStatus").asText());

        JsonNode essayView = data(questionView(student, sessionId,
                sessionQuestionIdOf(session, essay.getQuestionId())).andExpect(status().isOk()));
        assertEquals("Read the passage about heap generations first.",
                essayView.path("group").path("passageText").asText());
        assertEquals("Garbage collection", essayView.path("group").path("title").asText());
        assertEquals(10_000, essayView.path("answerSpace").path("maxLength").asInt());

        String raw = rawBody(singleRequest);
        assertFalse(raw.contains("correctOptionIds"), "the answer key leaked into a question view");
        assertFalse(raw.contains("keySnapshot"));
        assertFalse(raw.contains("key_snapshot"));
    }

    @Test
    void aQuestionFromAnotherSessionIsNotFound() throws Exception {
        JsonNode first = sessionOf(student, moduleA.getModuleId());
        long firstSessionId = first.path("sessionId").asLong();
        long foreignSessionQuestionId = sessionQuestionIdOf(first, single.getQuestionId());
        complete(student, firstSessionId).andExpect(status().isOk());

        JsonNode second = data(startSession(student, moduleA.getModuleId(), "{}").andExpect(status().isCreated()));
        long secondSessionId = second.path("sessionId").asLong();

        questionView(student, secondSessionId, foreignSessionQuestionId).andExpect(status().isNotFound());
        submit(student, secondSessionId, foreignSessionQuestionId,
                "{\"response\":{\"selectedOptionIds\":[" + singleRight.getOptionId() + "]}}")
                .andExpect(status().isNotFound());
        history(student, secondSessionId, foreignSessionQuestionId).andExpect(status().isNotFound());
    }

    // ------------------------------------------------------------------ MP-07

    @Test
    void completingKeepsUnansweredQuestionsAndIsIdempotent() throws Exception {
        JsonNode session = sessionOf(student, moduleA.getModuleId());
        long sessionId = session.path("sessionId").asLong();
        long singleId = sessionQuestionIdOf(session, single.getQuestionId());
        answer(student, sessionId, singleId,
                "{\"response\":{\"selectedOptionIds\":[" + singleRight.getOptionId() + "]}}");

        JsonNode completed = data(complete(student, sessionId).andExpect(status().isOk()));
        assertEquals("COMPLETED", completed.path("status").asText());
        assertEquals(ELIGIBLE_IN_MODULE_A, completed.path("questionCount").asInt());
        assertEquals(1, completed.path("answeredCount").asInt());
        assertEquals(1, completed.path("correctCount").asInt());
        assertFalse(completed.path("completedAt").isNull());

        JsonNode again = data(complete(student, sessionId).andExpect(status().isOk()));
        assertEquals("COMPLETED", again.path("status").asText());
        assertEquals(1, again.path("answeredCount").asInt());
        assertEquals(completed.path("completedAt").asText(), again.path("completedAt").asText());

        // A closed session accepts no further attempt, and completing marked nothing wrong.
        submit(student, sessionId, sessionQuestionIdOf(again, multi.getQuestionId()),
                "{\"response\":{\"selectedOptionIds\":[" + multiRightOne.getOptionId() + "]}}")
                .andExpect(status().isConflict());
        JsonNode result = data(result(student, sessionId).andExpect(status().isOk()));
        assertEquals(0, result.path("questionsLatestWrong").asInt());
        assertEquals(ELIGIBLE_IN_MODULE_A - 1, result.path("unansweredQuestions").asInt());
    }

    // ------------------------------------------------------------------ MP-08

    @Test
    void resultKeepsUniqueQuestionStatisticsApartFromAttemptStatistics() throws Exception {
        JsonNode session = sessionOf(student, moduleA.getModuleId());
        long sessionId = session.path("sessionId").asLong();
        long singleId = sessionQuestionIdOf(session, single.getQuestionId());
        long multiId = sessionQuestionIdOf(session, multi.getQuestionId());
        long tfId = sessionQuestionIdOf(session, trueFalse.getQuestionId());

        answer(student, sessionId, singleId,
                "{\"response\":{\"selectedOptionIds\":[" + singleWrong.getOptionId() + "]}}");
        answer(student, sessionId, singleId,
                "{\"response\":{\"selectedOptionIds\":[" + singleRight.getOptionId() + "]}}");
        answer(student, sessionId, singleId,
                "{\"response\":{\"selectedOptionIds\":[" + singleWrong.getOptionId() + "]}}");
        answer(student, sessionId, multiId,
                "{\"response\":{\"selectedOptionIds\":[" + multiRightOne.getOptionId() + "]}}");
        // A submission with an empty payload is refused, so it never becomes an attempt.
        submit(student, sessionId, tfId, "{\"response\":{}}").andExpect(status().isBadRequest());

        JsonNode result = data(result(student, sessionId).andExpect(status().isOk()));
        assertEquals(ELIGIBLE_IN_MODULE_A, result.path("totalQuestions").asInt());
        assertEquals(ELIGIBLE_IN_MODULE_A, result.path("questions").size());
        assertEquals(2, result.path("answeredQuestions").asInt(), "unique questions answered");
        assertEquals(ELIGIBLE_IN_MODULE_A - 2, result.path("unansweredQuestions").asInt());
        assertEquals(0, result.path("questionsLatestCorrect").asInt());
        assertEquals(2, result.path("questionsLatestWrong").asInt());
        assertEquals(0, result.path("questionsAwaitingGrade").asInt());
        assertEquals(0, result.path("questionsGradedWithoutVerdict").asInt());
        assertEquals(4, result.path("totalAttempts").asInt(), "attempts, not questions");
        assertEquals(4, result.path("gradedAttempts").asInt());
        assertEquals(1, result.path("correctAttempts").asInt());
        assertEquals(3, result.path("wrongAttempts").asInt());
        assertEquals(0.25, result.path("accuracyRate").asDouble(), 1e-9);

        // The per-question row carries the attempt count beside the latest outcome.
        for (JsonNode row : result.path("questions")) {
            if (row.path("questionId").asLong() == single.getQuestionId()) {
                assertEquals(3, row.path("attemptCount").asInt());
                assertFalse(row.path("latestIsCorrect").asBoolean());
                assertEquals(0.0, row.path("latestScore").asDouble(), 1e-9);
            }
        }
    }

    // ------------------------------------------------------------------ MP-11

    @Test
    void reviewQuestionsFollowTheLatestFinalizedResult() throws Exception {
        JsonNode session = sessionOf(student, moduleB.getModuleId());
        long sessionId = session.path("sessionId").asLong();
        long firstId = sessionQuestionIdOf(session, moduleBQuestions.get(0).getQuestionId());
        long secondId = sessionQuestionIdOf(session, moduleBQuestions.get(1).getQuestionId());

        JsonNode firstView = data(questionView(student, sessionId, firstId).andExpect(status().isOk()));
        long right = correctOptionOf(firstView);
        // Wrong first, then right: the latest finalized result is correct, so it leaves the list.
        answer(student, sessionId, firstId, wrongAnswer(firstView));
        answer(student, sessionId, firstId, "{\"response\":{\"selectedOptionIds\":[" + right + "]}}");
        JsonNode secondView = data(questionView(student, sessionId, secondId).andExpect(status().isOk()));
        answer(student, sessionId, secondId, wrongAnswer(secondView));

        var request = reviewQuestions(student, moduleB.getModuleId(), 0, 20);
        request.andExpect(status().isOk());
        JsonNode page = data(request);
        assertEquals(1, page.path("totalElements").asInt());
        JsonNode item = page.path("content").get(0);
        assertEquals(moduleBQuestions.get(1).getQuestionId(), item.path("questionId").asLong());
        assertEquals(moduleB.getModuleId(), item.path("moduleId").asLong());
        assertEquals("LEARNING", item.path("masteryStatus").asText());
        assertFalse(item.path("lastIsCorrect").asBoolean());
        // The listed question was answered wrong once: the other question's right/wrong pair is not counted here.
        assertEquals(1, item.path("totalAttempts").asInt());
        assertEquals(1, item.path("gradedAttempts").asInt());
        assertEquals(0, item.path("correctAttempts").asInt());
        assertEquals(1, item.path("wrongAttempts").asInt());
        assertFalse(rawBody(request).contains("isCorrect"), "the review list must not carry option correctness");
    }

    @Test
    void reviewQuestionsArePaginatedAndClamped() throws Exception {
        JsonNode page = data(reviewQuestions(student, moduleB.getModuleId(), -1, 1000).andExpect(status().isOk()));
        assertEquals(0, page.path("page").asInt());
        assertEquals(50, page.path("size").asInt(), "a page size is capped");
        assertEquals(0, page.path("totalElements").asInt());
    }

    // ------------------------------------------------------------------ authorisation

    /**
     * The access rule is applied on the module-scoped routes for every call, and on the session-scoped
     * routes as well: a session opened while a module was visible stops being reachable as soon as the
     * module is hidden or the enrolment ends. The new session cannot be created either.
     */
    @Test
    void anExistingSessionIsRefusedOnceTheModuleIsHiddenOrTheEnrolmentEnds() throws Exception {
        JsonNode session = sessionOf(student, moduleA.getModuleId());
        long sessionId = session.path("sessionId").asLong();
        long sessionQuestionId = sessionQuestionIdOf(session, single.getQuestionId());
        answer(student, sessionId, sessionQuestionId,
                "{\"response\":{\"selectedOptionIds\":[" + singleRight.getOptionId() + "]}}");

        moduleA.setStatus(Module.STATUS_HIDDEN);
        em.flush();
        mvc.perform(get("/api/v1/student/practice/sessions/{sessionId}", sessionId)
                .with(user(principal(student)))).andExpect(status().isNotFound());
        questionView(student, sessionId, sessionQuestionId).andExpect(status().isNotFound());
        history(student, sessionId, sessionQuestionId).andExpect(status().isNotFound());
        result(student, sessionId).andExpect(status().isNotFound());
        complete(student, sessionId).andExpect(status().isNotFound());
        submit(student, sessionId, sessionQuestionId,
                "{\"response\":{\"selectedOptionIds\":[" + singleWrong.getOptionId() + "]}}")
                .andExpect(status().isNotFound());
        explain(student, single.getQuestionId(), "{\"sessionId\":" + sessionId + "}")
                .andExpect(status().isNotFound());
        startSession(student, moduleA.getModuleId(), "{}").andExpect(status().isNotFound());

        // Visible again, but the student no longer has an active enrolment in the course. The explicit
        // flush matters: a JPQL bulk update does not auto-flush an unrelated dirty entity, so the
        // status change would be dropped by the clear below.
        moduleA.setStatus(Module.STATUS_VISIBLE);
        em.flush();
        em.createQuery("UPDATE Enrollment e SET e.status = 'CANCELLED' WHERE e.user.userId = :uid "
                        + "AND e.course.courseId = :cid")
                .setParameter("uid", student.getUserId())
                .setParameter("cid", course.getCourseId())
                .executeUpdate();
        em.clear();
        mvc.perform(get("/api/v1/student/practice/sessions/{sessionId}", sessionId)
                .with(user(principal(student)))).andExpect(status().isForbidden());
        questionView(student, sessionId, sessionQuestionId).andExpect(status().isForbidden());
        result(student, sessionId).andExpect(status().isForbidden());
        complete(student, sessionId).andExpect(status().isForbidden());
        submit(student, sessionId, sessionQuestionId,
                "{\"response\":{\"selectedOptionIds\":[" + singleWrong.getOptionId() + "]}}")
                .andExpect(status().isForbidden());
        explain(student, single.getQuestionId(), "{\"sessionId\":" + sessionId + "}")
                .andExpect(status().isForbidden());
        startSession(student, moduleA.getModuleId(), "{}").andExpect(status().isForbidden());
        overview(student, moduleA.getModuleId()).andExpect(status().isForbidden());
    }

    @Test
    void hiddenAndUnreachableModulesAreRefused() throws Exception {
        overview(student, moduleD.getModuleId()).andExpect(status().isNotFound());
        startSession(student, moduleD.getModuleId(), "{}").andExpect(status().isNotFound());
        // moduleE belongs to a course the student is not enrolled in.
        overview(student, moduleE.getModuleId()).andExpect(status().isForbidden());
        startSession(student, moduleE.getModuleId(), "{}").andExpect(status().isForbidden());
        reviewQuestions(student, moduleE.getModuleId(), 0, 20).andExpect(status().isForbidden());
        reset(student, moduleE.getModuleId()).andExpect(status().isForbidden());
        // A module that does not exist is a 404, never a 500.
        overview(student, 999_999L).andExpect(status().isNotFound());
    }

    @Test
    void everyEndpointRequiresAuthentication() throws Exception {
        mvc.perform(get("/api/v1/student/modules/{moduleId}/practice/overview", moduleA.getModuleId()))
                .andExpect(status().isUnauthorized());
        mvc.perform(get("/api/v1/student/practice/sessions/{sessionId}", 1L))
                .andExpect(status().isUnauthorized());
        mvc.perform(get("/api/v1/student/modules/{moduleId}/practice/review-questions", moduleA.getModuleId()))
                .andExpect(status().isUnauthorized());
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .delete("/api/v1/student/modules/{moduleId}/practice/progress", moduleA.getModuleId()))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void anotherStudentCannotReadOrWriteAPracticeSession() throws Exception {
        JsonNode session = sessionOf(student, moduleA.getModuleId());
        long sessionId = session.path("sessionId").asLong();
        long sessionQuestionId = sessionQuestionIdOf(session, single.getQuestionId());

        mvc.perform(get("/api/v1/student/practice/sessions/{sessionId}", sessionId)
                .with(user(principal(otherStudent)))).andExpect(status().isNotFound());
        questionView(otherStudent, sessionId, sessionQuestionId).andExpect(status().isNotFound());
        history(otherStudent, sessionId, sessionQuestionId).andExpect(status().isNotFound());
        result(otherStudent, sessionId).andExpect(status().isNotFound());
        complete(otherStudent, sessionId).andExpect(status().isNotFound());
        submit(otherStudent, sessionId, sessionQuestionId,
                "{\"response\":{\"selectedOptionIds\":[" + singleRight.getOptionId() + "]}}")
                .andExpect(status().isNotFound());
        explain(otherStudent, single.getQuestionId(), "{\"sessionId\":" + sessionId + "}")
                .andExpect(status().isNotFound());
        assertEquals(0, count("SELECT COUNT(a) FROM QuestionPracticeAnswer a"),
                "another student's request must never write an attempt");
    }

    @Test
    void aStudentCannotResetAnotherStudentsProgress() throws Exception {
        JsonNode session = sessionOf(student, moduleA.getModuleId());
        long sessionQuestionId = sessionQuestionIdOf(session, single.getQuestionId());
        answer(student, session.path("sessionId").asLong(), sessionQuestionId,
                "{\"response\":{\"selectedOptionIds\":[" + singleRight.getOptionId() + "]}}");

        reset(otherStudent, moduleA.getModuleId()).andExpect(status().isForbidden());
        assertEquals(1, count("SELECT COUNT(s) FROM QuestionPracticeSession s"));
        assertEquals(1, count("SELECT COUNT(a) FROM QuestionPracticeAnswer a"));
    }

    // ------------------------------------------------------------------ helpers

    private long questionIdByContent(String content) {
        return em.createQuery("SELECT q.questionId FROM Question q WHERE q.content = :content", Long.class)
                .setParameter("content", content)
                .getSingleResult();
    }

    private List<Long> questionIdsOf(JsonNode session) {
        List<Long> ids = new ArrayList<>();
        for (JsonNode row : session.path("questions")) {
            ids.add(row.path("questionId").asLong());
        }
        return ids;
    }

    /** The fixture's correct option is the one whose text is "right". */
    private long correctOptionOf(JsonNode view) {
        for (JsonNode option : view.path("options")) {
            if ("right".equals(option.path("optionText").asText())) {
                return option.path("optionId").asLong();
            }
        }
        throw new AssertionError("the fixture question has no option named 'right'");
    }

    private String wrongAnswer(JsonNode view) {
        long wrong = view.path("options").get(0).path("optionId").asLong();
        if (wrong == correctOptionOf(view)) {
            wrong = view.path("options").get(1).path("optionId").asLong();
        }
        return "{\"response\":{\"selectedOptionIds\":[" + wrong + "]}}";
    }
}
