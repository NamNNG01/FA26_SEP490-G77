package com.examprep.controllers.student;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * MP-12: the reset is strictly PRACTICE_ONLY.
 *
 * <p>The test builds the whole neighbourhood of a student before resetting one module: practice of
 * two modules by this student, one module by another student, a mistake-notebook row with a
 * bookmark, exam attempts and answers, flashcards with card progress, AI usage history and
 * enrolments. Exactly the practice data of the requested module may disappear.</p>
 */
class ModulePracticeResetIsolationTest extends ModulePracticeTestBase {

    @Test
    void resetRemovesOnlyThisStudentsPracticeDataOfThisModule() throws Exception {
        // This student practises module A (with one repeated question and one queued rubric answer)
        // and module B; another student practises module E of the other course.
        JsonNode sessionA = sessionOf(student, moduleA.getModuleId());
        long sessionAId = sessionA.path("sessionId").asLong();
        long singleId = sessionQuestionIdOf(sessionA, single.getQuestionId());
        long multiId = sessionQuestionIdOf(sessionA, multi.getQuestionId());
        long essayId = sessionQuestionIdOf(sessionA, essay.getQuestionId());
        answer(student, sessionAId, singleId,
                "{\"response\":{\"selectedOptionIds\":[" + singleWrong.getOptionId() + "]}}");
        answer(student, sessionAId, singleId,
                "{\"response\":{\"selectedOptionIds\":[" + singleRight.getOptionId() + "]}}");
        answer(student, sessionAId, multiId,
                "{\"response\":{\"selectedOptionIds\":[" + multiRightOne.getOptionId() + "]}}");
        answer(student, sessionAId, essayId, "{\"response\":{\"text\":\"My essay.\"}}");
        complete(student, sessionAId).andExpect(status().isOk());

        JsonNode sessionB = sessionOf(student, moduleB.getModuleId());
        answer(student, sessionB.path("sessionId").asLong(),
                sessionQuestionIdOf(sessionB, moduleBQuestions.get(0).getQuestionId()),
                "{\"response\":{\"selectedOptionIds\":[" + correctOptionOf(moduleBQuestions.get(0).getQuestionId())
                        + "]}}");

        JsonNode sessionE = sessionOf(otherStudent, moduleE.getModuleId());
        answer(otherStudent, sessionE.path("sessionId").asLong(),
                sessionQuestionIdOf(sessionE, questionIdByContent("Other course question")),
                "{\"response\":{\"selectedOptionIds\":[" + correctOptionOf(
                        questionIdByContent("Other course question")) + "]}}");

        // State before the reset.
        assertEquals(3, count("SELECT COUNT(s) FROM QuestionPracticeSession s"));
        assertEquals(13, count("SELECT COUNT(q) FROM QuestionPracticeSessionQuestion q"), "9 + 3 + 1 paper rows");
        assertEquals(6, count("SELECT COUNT(a) FROM QuestionPracticeAnswer a"), "4 + 1 + 1 attempts");
        assertEquals(3, count("SELECT COUNT(p) FROM QuestionPracticeProgress p WHERE p.module.moduleId = "
                + moduleA.getModuleId()), "one row per answered question of module A");
        assertEquals(1, count("SELECT COUNT(p) FROM QuestionPracticeProgress p WHERE p.module.moduleId = "
                + moduleB.getModuleId()));
        assertEquals(1, count("SELECT COUNT(p) FROM QuestionPracticeProgress p WHERE p.module.moduleId = "
                + moduleE.getModuleId()));

        long notebookBefore = count("SELECT COUNT(r) FROM StudentQuestionReview r");
        long bookmarksBefore = count("SELECT COUNT(r) FROM StudentQuestionReview r WHERE r.bookmark = TRUE");
        long attemptsBefore = count("SELECT COUNT(a) FROM ExamAttempt a");
        long examAnswersBefore = count("SELECT COUNT(a) FROM AttemptAnswer a");
        long cardsBefore = count("SELECT COUNT(c) FROM UserCardProgress c");
        long decksBefore = count("SELECT COUNT(d) FROM Deck d");
        long aiLogsBefore = count("SELECT COUNT(l) FROM AiUsageLog l");
        long enrollmentsBefore = count("SELECT COUNT(e) FROM Enrollment e");
        long questionsBefore = count("SELECT COUNT(q) FROM Question q");
        long optionsBefore = count("SELECT COUNT(o) FROM AnswerOption o");
        assertTrue(notebookBefore > 0 && bookmarksBefore > 0);
        assertTrue(attemptsBefore > 0 && examAnswersBefore > 0 && cardsBefore > 0 && decksBefore > 0);

        var request = reset(student, moduleA.getModuleId());
        request.andExpect(status().isOk());
        JsonNode reset = data(request);
        assertEquals(moduleA.getModuleId(), reset.path("moduleId").asLong());
        assertEquals(1, reset.path("deletedSessions").asInt());
        assertEquals(3, reset.path("deletedProgressRecords").asInt());

        // Module A practice is gone, including the frozen paper and every stored attempt of it.
        assertEquals(0, count("SELECT COUNT(s) FROM QuestionPracticeSession s WHERE s.module.moduleId = "
                + moduleA.getModuleId()));
        assertEquals(0, count("SELECT COUNT(q) FROM QuestionPracticeSessionQuestion q WHERE q.session.module.moduleId = "
                + moduleA.getModuleId()));
        assertEquals(0, count("SELECT COUNT(p) FROM QuestionPracticeProgress p WHERE p.module.moduleId = "
                + moduleA.getModuleId()));
        assertEquals(2, count("SELECT COUNT(s) FROM QuestionPracticeSession s"), "the other sessions stay");
        assertEquals(4, count("SELECT COUNT(q) FROM QuestionPracticeSessionQuestion q"));
        assertEquals(2, count("SELECT COUNT(a) FROM QuestionPracticeAnswer a"),
                "only module A's attempts were cascaded away");
        assertEquals(1, count("SELECT COUNT(p) FROM QuestionPracticeProgress p WHERE p.module.moduleId = "
                + moduleB.getModuleId()));
        assertEquals(1, count("SELECT COUNT(p) FROM QuestionPracticeProgress p WHERE p.module.moduleId = "
                + moduleE.getModuleId()), "another student's progress is untouched");
        assertEquals(1, count("SELECT COUNT(s) FROM QuestionPracticeSession s WHERE s.user.userId = "
                + otherStudent.getUserId()));

        // Everything outside Module Practice is untouched.
        assertEquals(questionsBefore, count("SELECT COUNT(q) FROM Question q"), "the question bank is shared");
        assertEquals(optionsBefore, count("SELECT COUNT(o) FROM AnswerOption o"));
        assertEquals(notebookBefore, count("SELECT COUNT(r) FROM StudentQuestionReview r"),
                "the mistake notebook survives");
        assertEquals(bookmarksBefore, count("SELECT COUNT(r) FROM StudentQuestionReview r WHERE r.bookmark = TRUE"),
                "bookmarks survive");
        assertEquals(attemptsBefore, count("SELECT COUNT(a) FROM ExamAttempt a"));
        assertEquals(examAnswersBefore, count("SELECT COUNT(a) FROM AttemptAnswer a"));
        assertEquals(cardsBefore, count("SELECT COUNT(c) FROM UserCardProgress c"), "flashcard progress survives");
        assertEquals(decksBefore, count("SELECT COUNT(d) FROM Deck d"));
        assertEquals(aiLogsBefore, count("SELECT COUNT(l) FROM AiUsageLog l"), "AI usage history survives");
        assertEquals(enrollmentsBefore, count("SELECT COUNT(e) FROM Enrollment e"));

        // A clean slate: the module can be practised from scratch again.
        JsonNode fresh = data(startSession(student, moduleA.getModuleId(), "{}").andExpect(status().isCreated()));
        assertEquals(9, fresh.path("questionCount").asInt());
        assertEquals(0, fresh.path("answeredCount").asInt());
        JsonNode overview = data(overview(student, moduleA.getModuleId()).andExpect(status().isOk()));
        assertEquals(0, overview.path("practicedQuestions").asInt());
        assertEquals(0, overview.path("totalAttempts").asInt());
        assertEquals(0, overview.path("questionsNeedingReview").asInt());
        assertEquals(0.0, overview.path("accuracyRate").asDouble(), 1e-9);
    }

    @Test
    void resetOfAModuleWithoutPracticeReportsZeroAndChangesNothing() throws Exception {
        long paperBefore = count("SELECT COUNT(q) FROM QuestionPracticeSessionQuestion q");
        JsonNode reset = data(reset(student, moduleC.getModuleId()).andExpect(status().isOk()));
        assertEquals(0, reset.path("deletedSessions").asInt());
        assertEquals(0, reset.path("deletedProgressRecords").asInt());
        assertEquals(paperBefore, count("SELECT COUNT(q) FROM QuestionPracticeSessionQuestion q"));
    }

    /**
     * A grade that would land after the reset must not recreate what the reset deleted. Because a
     * reservation is only taken when an answer is claimed, a reset leaves nothing claimable and
     * nothing is billed.
     */
    @Test
    void anAiGradeCannotRecreateProgressAfterAReset() throws Exception {
        JsonNode session = sessionOf(student, moduleA.getModuleId());
        long sessionId = session.path("sessionId").asLong();
        long essayId = sessionQuestionIdOf(session, essay.getQuestionId());
        answer(student, sessionId, essayId, "{\"response\":{\"text\":\"My essay.\"}}");
        assertEquals(1, count("SELECT COUNT(a) FROM QuestionPracticeAnswer a WHERE a.gradingStatus = 'QUEUED'"));

        REPLIES.add(gradingReply("An answer that arrives too late."));
        reset(student, moduleA.getModuleId()).andExpect(status().isOk());
        assertEquals(0, count("SELECT COUNT(a) FROM QuestionPracticeAnswer a"));
        assertEquals(0, count("SELECT COUNT(p) FROM QuestionPracticeProgress p"));

        // The queued row went with its answer, so the worker has nothing to claim and nothing to write.
        assertFalse(gradingWorker.gradeNext(), "a reset leaves nothing claimable");
        assertEquals(0, count("SELECT COUNT(a) FROM QuestionPracticeAnswer a"),
                "a late grade must not recreate a deleted attempt");
        assertEquals(0, count("SELECT COUNT(p) FROM QuestionPracticeProgress p"),
                "a late grade must not recreate deleted progress");
        assertEquals(0, count("SELECT COUNT(l) FROM AiUsageLog l WHERE l.purpose = 'ESSAY_GRADING'"));
        assertEquals(0, count("SELECT COUNT(s) FROM QuestionPracticeSession s WHERE s.module.moduleId = "
                + moduleA.getModuleId()));
    }

    // ------------------------------------------------------------------ helpers

    private long questionIdByContent(String content) {
        return em.createQuery("SELECT q.questionId FROM Question q WHERE q.content = :content", Long.class)
                .setParameter("content", content)
                .getSingleResult();
    }

    private long correctOptionOf(long questionId) {
        return em.createQuery("SELECT o.optionId FROM AnswerOption o WHERE o.question.questionId = :questionId "
                        + "AND o.isCorrect = TRUE", Long.class)
                .setParameter("questionId", questionId)
                .getSingleResult();
    }
}
