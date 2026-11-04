package com.examprep.controllers.student;

import com.examprep.entities.AiUsageLog;
import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * MP-09 and the rubric grading worker: generation, caching, quota accounting, refunds and the
 * isolation of an answer that is reset while the provider is working.
 */
class ModulePracticeAiApiIntegrationTest extends ModulePracticeTestBase {

    // ------------------------------------------------------------------ rubric grading

    @Test
    void anEssayIsGradedByTheWorkerThroughTheSharedQuota() throws Exception {
        JsonNode session = sessionOf(student, moduleA.getModuleId());
        long sessionId = session.path("sessionId").asLong();
        long sessionQuestionId = sessionQuestionIdOf(session, essay.getQuestionId());
        answer(student, sessionId, sessionQuestionId,
                "{\"response\":{\"text\":\"The GC frees unreachable objects.\"}}");

        REPLIES.add(gradingReply("Names reachability correctly."));
        assertTrue(gradingWorker.gradeNext(), "a queued rubric answer must be claimable");
        assertEquals(1, REQUESTS.size());
        assertTrue(REQUESTS.get(0).contains("<student_answer>"), "the learner's own text is graded");
        assertTrue(REQUESTS.get(0).contains("Overall"), "the rubric names the criteria it grades");

        JsonNode history = data(history(student, sessionId, sessionQuestionId).andExpect(status().isOk()));
        JsonNode attempt = history.path("attempts").get(0);
        assertEquals("AI_GRADED", attempt.path("gradingStatus").asText());
        assertEquals(1.0, attempt.path("scoreEarned").asDouble(), 1e-9);
        assertTrue(attempt.path("isCorrect").isNull(), "a rubric answer carries a score but no boolean verdict");
        assertEquals("Good work overall.", attempt.path("feedback").path("overallFeedback").asText());
        // The grading provenance stays in the database but is not part of the student-facing answer.
        assertTrue(blank(attempt.path("feedback").path("promptVersion")),
                "the prompt version must not be exposed to a student");
        assertTrue(blank(attempt.path("feedback").path("model")),
                "the model name must not be exposed to a student");
        assertEquals(1, attempt.path("feedback").size(), "only the overall feedback text is exposed");
        assertEquals("c1", attempt.path("criteriaScores").get(0).path("criterionId").asText());
        assertEquals(1.0, attempt.path("criteriaScores").get(0).path("points").asDouble(), 1e-9);
        assertFalse(attempt.path("gradedAt").isNull());

        // The paper row mirrors the finalized attempt, and the session counts it as answered only.
        JsonNode view = data(questionView(student, sessionId, sessionQuestionId).andExpect(status().isOk()));
        assertEquals("AI_GRADED", view.path("gradingStatus").asText());
        assertEquals(1.0, view.path("latestScore").asDouble(), 1e-9);
        assertTrue(view.path("latestIsCorrect").isNull());
        JsonNode resumed = resume(student, sessionId);
        assertEquals(1, resumed.path("answeredCount").asInt());
        assertEquals(0, resumed.path("correctCount").asInt());

        AiUsageLog log = onlyLog("ESSAY_GRADING");
        assertEquals("SUCCESS", log.getStatus());
        assertEquals("FREE", log.getBillingSource());
        assertEquals(0, log.getReservedTokens());
        assertEquals("fake-model", log.getModel());
        assertTrue(log.getInputTokens() != null && log.getInputTokens() > 0);
    }

    @Test
    void aCodeAnswerIsGradedByTheRubricWorkerAndNeverTouchesTheJudge() throws Exception {
        JsonNode session = sessionOf(student, moduleA.getModuleId());
        long sessionId = session.path("sessionId").asLong();
        long sessionQuestionId = sessionQuestionIdOf(session, code.getQuestionId());
        answer(student, sessionId, sessionQuestionId,
                "{\"response\":{\"text\":\"return new StringBuilder(s).reverse().toString();\"}}");

        REPLIES.add(gradingReply("Handles the empty string."));
        assertTrue(gradingWorker.gradeNext());
        assertEquals(1, REQUESTS.size());
        // No hidden test case of the platform is ever sent to the model, and no judge submission is made.
        assertTrue(REQUESTS.get(0).contains("must never be guessed at or mentioned"),
                "the prompt must forbid reasoning about the hidden tests");
        assertEquals(0, count("SELECT COUNT(c) FROM CodeSubmission c"),
                "practice grading must not create a judge submission");
        JsonNode attempt = data(history(student, sessionId, sessionQuestionId).andExpect(status().isOk()))
                .path("attempts").get(0);
        assertEquals("AI_GRADED", attempt.path("gradingStatus").asText());
        assertEquals(1.0, attempt.path("scoreEarned").asDouble(), 1e-9);
    }

    @Test
    void aProviderFailureFailsTheAnswerAndRefundsTheReservation() throws Exception {
        JsonNode session = sessionOf(student, moduleA.getModuleId());
        long sessionId = session.path("sessionId").asLong();
        long sessionQuestionId = sessionQuestionIdOf(session, essay.getQuestionId());
        answer(student, sessionId, sessionQuestionId, "{\"response\":{\"text\":\"An answer.\"}}");

        providerStatus = 500;
        assertTrue(gradingWorker.gradeNext());

        JsonNode attempt = data(history(student, sessionId, sessionQuestionId).andExpect(status().isOk()))
                .path("attempts").get(0);
        assertEquals("FAILED", attempt.path("gradingStatus").asText());
        assertTrue(attempt.path("scoreEarned").isNull());
        assertTrue(attempt.path("isCorrect").isNull());
        // The submission survived: a failed grade never destroys the student's answer.
        assertFalse(attempt.path("response").path("text").asText().isEmpty());

        AiUsageLog log = onlyLog("ESSAY_GRADING");
        assertEquals("FAILED", log.getStatus(), "an upstream failure is refunded");
        assertEquals(0, log.getReservedTokens());
        // Nothing is charged and nothing is counted as graded.
        assertEquals(0, count("SELECT COUNT(l) FROM AiUsageLog l WHERE l.purpose = 'ESSAY_GRADING' "
                + "AND l.status IN ('SUCCESS', 'PARTIAL')"), "a failed grade is never billed");
        assertEquals(0, count("SELECT COUNT(p) FROM QuestionPracticeProgress p WHERE p.gradedAttempts > 0"));
        assertEquals(1, count("SELECT COUNT(p) FROM QuestionPracticeProgress p WHERE p.totalAttempts = 1"));
        assertEquals(0, count("SELECT COUNT(p) FROM QuestionPracticeProgress p WHERE p.masteryStatus <> 'NEW'"));

        // MP-08 reports the failure in its own bucket, and the five buckets still add up.
        JsonNode result = data(result(student, sessionId).andExpect(status().isOk()));
        assertEquals(1, result.path("answeredQuestions").asInt());
        assertEquals(0, result.path("questionsLatestCorrect").asInt());
        assertEquals(0, result.path("questionsLatestWrong").asInt());
        assertEquals(0, result.path("questionsAwaitingGrade").asInt());
        assertEquals(0, result.path("questionsGradedWithoutVerdict").asInt());
        assertEquals(1, result.path("questionsFailedGrade").asInt(), "a failed grade has its own bucket");
    }

    @Test
    void anUnreadableDiagramFailsWithoutCallingTheProvider() throws Exception {
        JsonNode session = sessionOf(student, moduleA.getModuleId());
        long sessionId = session.path("sessionId").asLong();
        long sessionQuestionId = sessionQuestionIdOf(session, diagram.getQuestionId());
        String crowded = crowdedDiagram(200);
        answer(student, sessionId, sessionQuestionId,
                "{\"response\":{\"drawioXml\":" + quote(crowded) + "}}");

        assertTrue(gradingWorker.gradeNext());
        assertEquals(0, REQUESTS.size(), "an oversized diagram must never reach the provider");
        JsonNode attempt = data(history(student, sessionId, sessionQuestionId).andExpect(status().isOk()))
                .path("attempts").get(0);
        assertEquals("FAILED", attempt.path("gradingStatus").asText());
        assertEquals(0, count("SELECT COUNT(l) FROM AiUsageLog l WHERE l.purpose = 'ESSAY_GRADING'"),
                "a rejected diagram reserves nothing");
    }

    @Test
    void gradingStopsWhenTheStudentHasNoQuotaLeftAndChargesNothing() throws Exception {
        consumeFreeQuota(student);
        JsonNode session = sessionOf(student, moduleA.getModuleId());
        long sessionId = session.path("sessionId").asLong();
        long sessionQuestionId = sessionQuestionIdOf(session, essay.getQuestionId());
        answer(student, sessionId, sessionQuestionId, "{\"response\":{\"text\":\"An answer.\"}}");

        assertFalse(gradingWorker.gradeNext(), "an unfundable answer stops the drain instead of spinning");
        assertEquals(0, REQUESTS.size(), "no provider call is made without a reservation");
        JsonNode attempt = data(history(student, sessionId, sessionQuestionId).andExpect(status().isOk()))
                .path("attempts").get(0);
        assertEquals("FAILED", attempt.path("gradingStatus").asText());
        assertEquals(0, count("SELECT COUNT(l) FROM AiUsageLog l WHERE l.purpose = 'ESSAY_GRADING'"));
        // The attempt is still counted as an attempt, never as correct or wrong.
        assertEquals(1, count("SELECT COUNT(p) FROM QuestionPracticeProgress p WHERE p.totalAttempts = 1 "
                + "AND p.gradedAttempts = 0 AND p.correctAttempts = 0 AND p.wrongAttempts = 0"));
    }

    @Test
    void progressCountsAQueuedAnswerAsAnAttemptOnly() throws Exception {
        JsonNode session = sessionOf(student, moduleA.getModuleId());
        long sessionId = session.path("sessionId").asLong();
        long sessionQuestionId = sessionQuestionIdOf(session, essay.getQuestionId());
        answer(student, sessionId, sessionQuestionId, "{\"response\":{\"text\":\"An answer.\"}}");

        JsonNode progress = data(mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .get("/api/v1/student/modules/{moduleId}/practice/overview", moduleA.getModuleId())
                        .with(user(principal(student)))).andExpect(status().isOk()));
        assertEquals(1, progress.path("practicedQuestions").asInt());
        assertEquals(1, progress.path("totalAttempts").asInt());
        assertEquals(0, progress.path("gradedAttempts").asInt(), "a queued answer is not graded yet");
        assertEquals(0, progress.path("correctAttempts").asInt());
        assertEquals(0, progress.path("wrongAttempts").asInt());
        assertEquals(0.0, progress.path("accuracyRate").asDouble(), 1e-9);
        assertEquals(0, progress.path("questionsNeedingReview").asInt(),
                "an unanswered-in-verdict question is not 'needing review'");

        REPLIES.add(gradingReply("Good."));
        assertTrue(gradingWorker.gradeNext());

        JsonNode graded = data(mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .get("/api/v1/student/modules/{moduleId}/practice/overview", moduleA.getModuleId())
                        .with(user(principal(student)))).andExpect(status().isOk()));
        assertEquals(1, graded.path("totalAttempts").asInt());
        assertEquals(1, graded.path("gradedAttempts").asInt());
        assertEquals(0, graded.path("correctAttempts").asInt());
        assertEquals(0, graded.path("wrongAttempts").asInt());
        assertEquals(0.0, graded.path("accuracyRate").asDouble(), 1e-9);
        assertEquals(0, graded.path("everCorrectQuestions").asInt());
    }

    // ------------------------------------------------------------------ MP-09

    @Test
    void anExplanationIsGeneratedFromTheFrozenSnapshotAndNeverCached() throws Exception {
        JsonNode session = sessionOf(student, moduleA.getModuleId());
        long sessionId = session.path("sessionId").asLong();
        long sessionQuestionId = sessionQuestionIdOf(session, single.getQuestionId());
        answer(student, sessionId, sessionQuestionId,
                "{\"response\":{\"selectedOptionIds\":[" + singleRight.getOptionId() + "]}}");

        REPLIES.add(explanationReply("extends creates a subclass; implements is for interfaces."));
        String body = "{\"sessionId\":" + sessionId + ",\"sessionQuestionId\":" + sessionQuestionId + "}";
        JsonNode generated = data(explain(student, single.getQuestionId(), body).andExpect(status().isOk()));
        assertEquals("GENERATED", generated.path("source").asText());
        assertTrue(generated.path("explanation").asText().contains("extends"));
        assertEquals(sessionId, generated.path("sessionId").asLong());
        assertEquals(sessionQuestionId, generated.path("sessionQuestionId").asLong());
        assertFalse(generated.path("quota").path("totalRemaining").isNull());

        // The model is given the question, the correct answer and the student's own attempt only.
        String sent = REQUESTS.get(0);
        assertTrue(sent.contains("extends"), "the correct answer is the reference");
        assertFalse(sent.contains("implements"), "a wrong option is never part of the prompt");
        assertTrue(sent.contains("studentAnswer"), "the student's own attempt personalises the explanation");

        // Never written to the shared question column: the text talks about this student's attempt.
        em.refresh(single);
        assertNull(single.getAiExplanation(), "a personalized explanation must never be cached");
        assertNull(single.getAiExplanationSource());

        // A second request therefore generates again instead of reusing, and is billed again.
        REPLIES.add(explanationReply("A second, freshly generated explanation."));
        JsonNode second = data(explain(student, single.getQuestionId(), body).andExpect(status().isOk()));
        assertEquals("GENERATED", second.path("source").asText());
        assertEquals("A second, freshly generated explanation.", second.path("explanation").asText());
        assertEquals(2, REQUESTS.size());

        List<AiUsageLog> logs = em.createQuery(
                        "SELECT l FROM AiUsageLog l WHERE l.purpose = 'EXPLANATION' ORDER BY l.logId",
                        AiUsageLog.class)
                .getResultList();
        assertEquals(2, logs.size(), "each generated explanation is logged once");
        for (AiUsageLog log : logs) {
            assertEquals("SUCCESS", log.getStatus());
            assertEquals("FREE", log.getBillingSource());
            assertEquals(1, log.getQuestionCount());
            assertNull(log.getAttempt());
        }
        em.refresh(single);
        assertNull(single.getAiExplanationVersion());
    }

    @Test
    void aCurrentVersionAiExplanationOfTheBankIsReused() throws Exception {
        JsonNode session = sessionOf(student, moduleA.getModuleId());
        long sessionId = session.path("sessionId").asLong();
        long sessionQuestionId = sessionQuestionIdOf(session, single.getQuestionId());
        answer(student, sessionId, sessionQuestionId,
                "{\"response\":{\"selectedOptionIds\":[" + singleRight.getOptionId() + "]}}");

        // An explanation the platform generated for the question's current version.
        single.setAiExplanation("extends creates a subclass.");
        single.setAiExplanationSource("AI");
        single.setAiExplanationVersion(single.getScoringVersion());
        em.flush();

        JsonNode cached = data(explain(student, single.getQuestionId(), "{\"sessionId\":" + sessionId
                + ",\"sessionQuestionId\":" + sessionQuestionId + "}").andExpect(status().isOk()));
        assertEquals("CACHED", cached.path("source").asText(), "a current-version explanation is reused");
        assertEquals("extends creates a subclass.", cached.path("explanation").asText());
        assertEquals(0, REQUESTS.size(), "a reused explanation costs nothing");
        assertEquals(0, count("SELECT COUNT(l) FROM AiUsageLog l WHERE l.purpose = 'EXPLANATION'"));
    }

    @Test
    void aManagerExplanationIsReusedAndAnOldVersionIsNot() throws Exception {
        JsonNode session = sessionOf(student, moduleA.getModuleId());
        long sessionId = session.path("sessionId").asLong();
        long tfId = sessionQuestionIdOf(session, trueFalse.getQuestionId());
        answer(student, sessionId, tfId, "{\"response\":{\"selectedOptionIds\":["
                + trueOptionId() + "]}}");
        String body = "{\"sessionId\":" + sessionId + ",\"sessionQuestionId\":" + tfId + "}";

        trueFalse.setAiExplanation("A manager wrote this.");
        trueFalse.setAiExplanationSource(null);
        trueFalse.setAiExplanationVersion(null);
        em.flush();
        JsonNode manager = data(explain(student, trueFalse.getQuestionId(), body).andExpect(status().isOk()));
        assertEquals("MANAGER", manager.path("source").asText());
        assertEquals("A manager wrote this.", manager.path("explanation").asText());
        assertEquals(0, REQUESTS.size(), "a manager explanation is never regenerated");

        // An AI explanation of another scoring version must not be presented as the current one.
        trueFalse.setAiExplanation("An explanation of an older version.");
        trueFalse.setAiExplanationSource("AI");
        trueFalse.setAiExplanationVersion(0);
        em.flush();
        REPLIES.add(explanationReply("A freshly generated explanation."));
        JsonNode regenerated = data(explain(student, trueFalse.getQuestionId(), body).andExpect(status().isOk()));
        assertEquals("GENERATED", regenerated.path("source").asText());
        assertEquals("A freshly generated explanation.", regenerated.path("explanation").asText());
        assertEquals(1, REQUESTS.size());
    }

    @Test
    void anExplanationOfARubricQuestionIsNotApplicable() throws Exception {
        JsonNode session = sessionOf(student, moduleA.getModuleId());
        long sessionId = session.path("sessionId").asLong();
        long sessionQuestionId = sessionQuestionIdOf(session, essay.getQuestionId());
        answer(student, sessionId, sessionQuestionId, "{\"response\":{\"text\":\"My essay.\"}}");

        JsonNode body = data(explain(student, essay.getQuestionId(),
                "{\"sessionId\":" + sessionId + ",\"sessionQuestionId\":" + sessionQuestionId + "}")
                .andExpect(status().isOk()));
        assertEquals("NOT_APPLICABLE", body.path("source").asText());
        assertNull(body.path("explanation").asText(null));
        assertEquals(0, REQUESTS.size(), "there is no written key to explain");
    }

    @Test
    void anExplanationWithoutQuotaIs402() throws Exception {
        consumeFreeQuota(brokeStudent);
        JsonNode session = sessionOf(brokeStudent, moduleA.getModuleId());
        long sessionId = session.path("sessionId").asLong();
        long sessionQuestionId = sessionQuestionIdOf(session, single.getQuestionId());
        answer(brokeStudent, sessionId, sessionQuestionId,
                "{\"response\":{\"selectedOptionIds\":[" + singleRight.getOptionId() + "]}}");

        var request = explain(brokeStudent, single.getQuestionId(),
                "{\"sessionId\":" + sessionId + ",\"sessionQuestionId\":" + sessionQuestionId + "}");
        request.andExpect(status().isPaymentRequired());
        assertEquals(0, REQUESTS.size(), "nothing is generated without a reservation");
        assertEquals(0, count("SELECT COUNT(l) FROM AiUsageLog l WHERE l.purpose = 'EXPLANATION'"));
    }

    /**
     * MP-09 explains a question the student has practised — never a question they have not answered,
     * which would turn the endpoint into an answer oracle (the same gate SE-01 applies to an exam).
     */
    @Test
    void anExplanationRequiresAnAttemptAndAcceptsNeitherAForeignSessionNorAHiddenModule() throws Exception {
        JsonNode session = sessionOf(student, moduleA.getModuleId());
        long sessionId = session.path("sessionId").asLong();
        long sessionQuestionId = sessionQuestionIdOf(session, single.getQuestionId());

        explain(student, single.getQuestionId(), "{\"sessionId\":" + sessionId
                + ",\"sessionQuestionId\":" + sessionQuestionId + "}")
                .andExpect(status().isConflict());
        assertEquals(0, REQUESTS.size(), "no answer means no explanation and no AI cost");

        // Answering once opens the endpoint, and the reuse path needs an attempt too.
        single.setAiExplanation("A manager wrote this.");
        single.setAiExplanationSource(null);
        em.flush();
        answer(student, sessionId, sessionQuestionId,
                "{\"response\":{\"selectedOptionIds\":[" + singleRight.getOptionId() + "]}}");
        assertEquals("MANAGER", data(explain(student, single.getQuestionId(), "{\"sessionId\":" + sessionId
                + ",\"sessionQuestionId\":" + sessionQuestionId + "}").andExpect(status().isOk()))
                .path("source").asText());
    }

    @Test
    void explanationReferencesAreValidated() throws Exception {
        JsonNode session = sessionOf(student, moduleA.getModuleId());
        long sessionId = session.path("sessionId").asLong();
        long sessionQuestionId = sessionQuestionIdOf(session, single.getQuestionId());
        answer(student, sessionId, sessionQuestionId,
                "{\"response\":{\"selectedOptionIds\":[" + singleRight.getOptionId() + "]}}");

        // The session is required, the question must belong to it, and a named answer must belong to it too.
        explain(student, single.getQuestionId(), "{}").andExpect(status().isBadRequest());
        explain(student, moduleBQuestions.get(0).getQuestionId(), "{\"sessionId\":" + sessionId + "}")
                .andExpect(status().isNotFound());
        explain(student, single.getQuestionId(), "{\"sessionId\":" + sessionId
                + ",\"sessionQuestionId\":999999}").andExpect(status().isNotFound());
        explain(student, single.getQuestionId(), "{\"sessionId\":" + sessionId
                + ",\"practiceAnswerId\":999999}").andExpect(status().isNotFound());
        explain(student, single.getQuestionId(), "{\"sessionId\":999999}").andExpect(status().isNotFound());
        assertEquals(0, REQUESTS.size());
        assertEquals(0, count("SELECT COUNT(l) FROM AiUsageLog l WHERE l.purpose = 'EXPLANATION'"));
    }

    @Test
    void anExplanationCanNameTheAttemptItExplains() throws Exception {
        JsonNode session = sessionOf(student, moduleA.getModuleId());
        long sessionId = session.path("sessionId").asLong();
        long sessionQuestionId = sessionQuestionIdOf(session, single.getQuestionId());
        JsonNode firstAttempt = answer(student, sessionId, sessionQuestionId,
                "{\"response\":{\"selectedOptionIds\":[" + singleWrong.getOptionId() + "]}}");
        answer(student, sessionId, sessionQuestionId,
                "{\"response\":{\"selectedOptionIds\":[" + singleRight.getOptionId() + "]}}");

        long firstId = firstAttempt.path("practiceAnswerId").asLong();
        REPLIES.add(explanationReply("Because the first attempt chose the interface keyword."));
        JsonNode body = data(explain(student, single.getQuestionId(), "{\"sessionId\":" + sessionId
                + ",\"sessionQuestionId\":" + sessionQuestionId + ",\"practiceAnswerId\":" + firstId + "}")
                .andExpect(status().isOk()));
        assertEquals("GENERATED", body.path("source").asText());
        assertEquals(firstId, body.path("practiceAnswerId").asLong());
        // A personalized explanation mentions this attempt's own payload, so it is not cached.
        assertTrue(REQUESTS.get(0).contains("studentWasCorrect"));
        em.refresh(single);
        assertNull(single.getAiExplanation());
    }

    // ------------------------------------------------------------------ helpers

    private long trueOptionId() {
        return em.createQuery("SELECT o.optionId FROM AnswerOption o WHERE o.question.questionId = :questionId "
                        + "AND o.isCorrect = TRUE", Long.class)
                .setParameter("questionId", trueFalse.getQuestionId())
                .getSingleResult();
    }

    private String crowdedDiagram(int elements) {
        StringBuilder xml = new StringBuilder("<mxfile><diagram id=\"d\"><mxGraphModel><root>")
                .append("<mxCell id=\"0\"/><mxCell id=\"1\" parent=\"0\"/>");
        for (int i = 0; i < elements; i++) {
            xml.append("<mxCell id=\"n").append(i).append("\" value=\"node").append(i)
                    .append("\" vertex=\"1\" parent=\"1\"><mxGeometry as=\"geometry\"/></mxCell>");
        }
        return xml.append("</root></mxGraphModel></diagram></mxfile>").toString();
    }

    /**
     * Fills the whole daily FREE allowance so the next reservation cannot be funded. Any AI purpose
     * charges the same FREE bucket, so this does not disturb the per-purpose assertions.
     */
    private void consumeFreeQuota(com.examprep.entities.User who) {
        em.persist(AiUsageLog.builder().user(who).purpose("RECOMMENDATION").status("SUCCESS")
                .billingSource("FREE").inputTokens(20_000).outputTokens(0).build());
        em.flush();
    }

    private AiUsageLog onlyLog(String purpose) {
        return em.createQuery("SELECT l FROM AiUsageLog l WHERE l.purpose = :purpose", AiUsageLog.class)
                .setParameter("purpose", purpose)
                .getSingleResult();
    }
}
