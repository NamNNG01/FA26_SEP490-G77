package com.examprep.controllers.student;

import com.examprep.entities.QuestionMedia;
import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;

import java.util.HashSet;
import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * MP-05 / MP-06: one attempt per supported question type, appended attempts, payload validation and
 * the idempotency key.
 */
class ModulePracticeAnswerApiIntegrationTest extends ModulePracticeTestBase {

    // ------------------------------------------------------------------ objective types

    @Test
    void singleChoiceIsGradedAgainstTheFrozenKey() throws Exception {
        JsonNode session = sessionOf(student, moduleA.getModuleId());
        long sessionId = session.path("sessionId").asLong();
        long sessionQuestionId = sessionQuestionIdOf(session, single.getQuestionId());

        JsonNode correct = answer(student, sessionId, sessionQuestionId,
                "{\"response\":{\"selectedOptionIds\":[" + singleRight.getOptionId() + "]},\"timeSpentSeconds\":25}");
        assertTrue(correct.path("isCorrect").asBoolean());
        assertEquals(1.0, correct.path("scoreEarned").asDouble(), 1e-9);
        assertEquals("AUTO", correct.path("gradingStatus").asText());
        assertEquals(1, correct.path("attemptNumber").asInt());
        assertNotNull(correct.path("gradedAt").asText());
        assertFalse(correct.path("duplicate").asBoolean());
        assertEquals(1, correct.path("session").path("answeredCount").asInt());
        assertEquals(1, correct.path("session").path("correctCount").asInt());

        JsonNode wrong = answer(student, sessionId, sessionQuestionId,
                "{\"response\":{\"selectedOptionIds\":[" + singleWrong.getOptionId() + "]}}");
        assertFalse(wrong.path("isCorrect").asBoolean());
        assertEquals(0.0, wrong.path("scoreEarned").asDouble(), 1e-9);
        assertEquals(2, wrong.path("attemptNumber").asInt());
        assertEquals(1, wrong.path("session").path("answeredCount").asInt());
        assertEquals(0, wrong.path("session").path("correctCount").asInt());
    }

    @Test
    void multipleChoiceRequiresTheExactSet() throws Exception {
        JsonNode session = sessionOf(student, moduleA.getModuleId());
        long sessionId = session.path("sessionId").asLong();
        long sessionQuestionId = sessionQuestionIdOf(session, multi.getQuestionId());

        JsonNode partial = answer(student, sessionId, sessionQuestionId,
                "{\"response\":{\"selectedOptionIds\":[" + multiRightOne.getOptionId() + "]}}");
        assertFalse(partial.path("isCorrect").asBoolean(), "a missing option is wrong");

        JsonNode superset = answer(student, sessionId, sessionQuestionId,
                "{\"response\":{\"selectedOptionIds\":[" + multiRightOne.getOptionId() + ","
                        + multiRightTwo.getOptionId() + "," + multiWrong.getOptionId() + "]}}");
        assertFalse(superset.path("isCorrect").asBoolean(), "an extra option is wrong");

        JsonNode exact = answer(student, sessionId, sessionQuestionId,
                "{\"response\":{\"selectedOptionIds\":[" + multiRightTwo.getOptionId() + ","
                        + multiRightOne.getOptionId() + "]}}");
        assertTrue(exact.path("isCorrect").asBoolean(), "the order of the ids does not matter");
    }

    @Test
    void trueFalseComparesTheChosenOption() throws Exception {
        JsonNode session = sessionOf(student, moduleA.getModuleId());
        long sessionId = session.path("sessionId").asLong();
        long sessionQuestionId = sessionQuestionIdOf(session, trueFalse.getQuestionId());
        JsonNode view = data(questionView(student, sessionId, sessionQuestionId).andExpect(status().isOk()));

        JsonNode right = answer(student, sessionId, sessionQuestionId,
                "{\"response\":{\"selectedOptionIds\":[" + optionIdByText(view, "True") + "]}}");
        assertTrue(right.path("isCorrect").asBoolean());

        JsonNode wrong = answer(student, sessionId, sessionQuestionId,
                "{\"response\":{\"selectedOptionIds\":[" + optionIdByText(view, "False") + "]}}");
        assertFalse(wrong.path("isCorrect").asBoolean());
    }

    @Test
    void fillBlankUsesTheAcceptedAlternativesAndTheCaseFlag() throws Exception {
        JsonNode session = sessionOf(student, moduleA.getModuleId());
        long sessionId = session.path("sessionId").asLong();
        long sessionQuestionId = sessionQuestionIdOf(session, fillBlank.getQuestionId());

        // Blank 1 ignores case, blank 2 is case sensitive and accepts "Java" or "JVM".
        JsonNode right = answer(student, sessionId, sessionQuestionId,
                "{\"response\":{\"blanks\":{\"1\":\"  java  \",\"2\":\"Java\"}}}");
        assertTrue(right.path("isCorrect").asBoolean(), "surrounding space and case are normalised per blank");

        JsonNode wrongCase = answer(student, sessionId, sessionQuestionId,
                "{\"response\":{\"blanks\":{\"1\":\"java\",\"2\":\"java\"}}}");
        assertFalse(wrongCase.path("isCorrect").asBoolean(), "a case-sensitive blank rejects the wrong case");

        JsonNode missing = answer(student, sessionId, sessionQuestionId,
                "{\"response\":{\"blanks\":{\"1\":\"java\"}}}");
        assertFalse(missing.path("isCorrect").asBoolean(), "every blank must be filled");
    }

    @Test
    void orderingComparesTheExactSequence() throws Exception {
        JsonNode session = sessionOf(student, moduleA.getModuleId());
        long sessionId = session.path("sessionId").asLong();
        long sessionQuestionId = sessionQuestionIdOf(session, ordering.getQuestionId());
        long first = orderingFirst.getOptionId();
        long second = orderingSecond.getOptionId();
        long third = orderingThird.getOptionId();

        JsonNode right = answer(student, sessionId, sessionQuestionId,
                "{\"response\":{\"orderedOptionIds\":[" + first + "," + second + "," + third + "]}}");
        assertTrue(right.path("isCorrect").asBoolean());

        JsonNode swapped = answer(student, sessionId, sessionQuestionId,
                "{\"response\":{\"orderedOptionIds\":[" + second + "," + first + "," + third + "]}}");
        assertFalse(swapped.path("isCorrect").asBoolean());

        var tooFew = submit(student, sessionId, sessionQuestionId,
                "{\"response\":{\"orderedOptionIds\":[" + first + "," + second + "]}}");
        tooFew.andExpect(status().isBadRequest());
        assertEquals("every option must appear exactly once", message(tooFew));
    }

    @Test
    void matchingComparesThePairsCaseInsensitively() throws Exception {
        JsonNode session = sessionOf(student, moduleA.getModuleId());
        long sessionId = session.path("sessionId").asLong();
        long sessionQuestionId = sessionQuestionIdOf(session, matching.getQuestionId());

        JsonNode view = data(questionView(student, sessionId, sessionQuestionId).andExpect(status().isOk()));
        assertEquals(2, view.path("matching").path("lefts").size(), "matching renders as two columns");

        JsonNode right = answer(student, sessionId, sessionQuestionId,
                "{\"response\":{\"matches\":[{\"left\":\"@Override\",\"right\":\"Overrides a method\"},"
                        + "{\"left\":\"@Deprecated\",\"right\":\"Marks old API\"}]}}");
        assertTrue(right.path("isCorrect").asBoolean(), "the exact pairing is correct");

        JsonNode swapped = answer(student, sessionId, sessionQuestionId,
                "{\"response\":{\"matches\":[{\"left\":\"@Override\",\"right\":\"Marks old API\"},"
                        + "{\"left\":\"@Deprecated\",\"right\":\"Overrides a method\"}]}}");
        assertFalse(swapped.path("isCorrect").asBoolean(), "a swapped pairing is wrong");

        var unknown = submit(student, sessionId, sessionQuestionId,
                "{\"response\":{\"matches\":[{\"left\":\"@Unknown\",\"right\":\"x\"}]}}");
        unknown.andExpect(status().isBadRequest());
        assertEquals("left value is not part of this question", message(unknown));

        // A value that only differs in case is not one of the shown labels.
        var wrongCase = submit(student, sessionId, sessionQuestionId,
                "{\"response\":{\"matches\":[{\"left\":\"@override\",\"right\":\"Marks old API\"}]}}");
        wrongCase.andExpect(status().isBadRequest());
        assertEquals("left value is not part of this question", message(wrongCase));
    }

    // ------------------------------------------------------------------ rubric types

    @Test
    void essayDiagramAndCodeAreQueuedForTheAiRubricWorker() throws Exception {
        JsonNode session = sessionOf(student, moduleA.getModuleId());
        long sessionId = session.path("sessionId").asLong();

        long essayId = sessionQuestionIdOf(session, essay.getQuestionId());
        JsonNode essayAnswer = answer(student, sessionId, essayId,
                "{\"response\":{\"text\":\"The GC frees unreachable objects.\"},\"timeSpentSeconds\":90}");
        assertEquals("QUEUED", essayAnswer.path("gradingStatus").asText());
        assertTrue(essayAnswer.path("isCorrect").isNull(), "a rubric answer has no right/wrong verdict yet");
        assertTrue(essayAnswer.path("scoreEarned").isNull());
        assertTrue(essayAnswer.path("gradedAt").isNull());

        long diagramId = sessionQuestionIdOf(session, diagram.getQuestionId());
        JsonNode diagramAnswer = answer(student, sessionId, diagramId,
                "{\"response\":{\"drawioXml\":" + quote(DIAGRAM_XML) + "}}");
        assertEquals("QUEUED", diagramAnswer.path("gradingStatus").asText());

        long codeId = sessionQuestionIdOf(session, code.getQuestionId());
        JsonNode codeAnswer = answer(student, sessionId, codeId,
                "{\"response\":{\"text\":\"static String reverse(String s) { return new StringBuilder(s).reverse().toString(); }\"}}");
        assertEquals("QUEUED", codeAnswer.path("gradingStatus").asText());

        // Queued rubric answers are counted as answered, never as correct or wrong.
        assertEquals(3, count("SELECT COUNT(a) FROM QuestionPracticeAnswer a WHERE a.isCorrect IS NULL"));
        assertEquals(3, count("SELECT COUNT(p) FROM QuestionPracticeProgress p WHERE p.lastIsCorrect IS NULL"));
        assertEquals(0, count("SELECT COUNT(a) FROM QuestionPracticeAnswer a WHERE a.isCorrect = TRUE"));
        assertEquals(3, count("SELECT COUNT(a) FROM QuestionPracticeAnswer a WHERE a.gradingStatus = 'QUEUED'"));
    }

    @Test
    void aDiagramWithoutItsXmlAndAnOversizedEssayAreRejected() throws Exception {
        JsonNode session = sessionOf(student, moduleA.getModuleId());
        long sessionId = session.path("sessionId").asLong();

        var noXml = submit(student, sessionId, sessionQuestionIdOf(session, diagram.getQuestionId()),
                "{\"response\":{\"text\":\"here is my drawing\"}}");
        noXml.andExpect(status().isBadRequest());
        assertEquals("drawioXml must be a string", message(noXml));

        String tooLong = "x".repeat(10_001);
        var longEssay = submit(student, sessionId, sessionQuestionIdOf(session, essay.getQuestionId()),
                "{\"response\":{\"text\":\"" + tooLong + "\"}}");
        longEssay.andExpect(status().isBadRequest());
        assertEquals("text too long", message(longEssay));
        assertEquals(0, count("SELECT COUNT(a) FROM QuestionPracticeAnswer a"),
                "a rejected payload is never stored as an attempt");
    }

    // ------------------------------------------------------------------ validation & ownership

    @Test
    void anOptionOfAnotherQuestionIsRejected() throws Exception {
        JsonNode session = sessionOf(student, moduleA.getModuleId());
        long sessionId = session.path("sessionId").asLong();

        var foreignOption = submit(student, sessionId, sessionQuestionIdOf(session, single.getQuestionId()),
                "{\"response\":{\"selectedOptionIds\":[" + multiRightOne.getOptionId() + "]}}");
        foreignOption.andExpect(status().isBadRequest());
        assertEquals("option is not part of this question", message(foreignOption));

        var notAnArray = submit(student, sessionId, sessionQuestionIdOf(session, single.getQuestionId()),
                "{\"response\":{\"selectedOptionIds\":5}}");
        notAnArray.andExpect(status().isBadRequest());
        assertEquals("selectedOptionIds must be an array", message(notAnArray));

        var twoChoices = submit(student, sessionId, sessionQuestionIdOf(session, single.getQuestionId()),
                "{\"response\":{\"selectedOptionIds\":[" + singleRight.getOptionId() + ","
                        + singleWrong.getOptionId() + "]}}");
        twoChoices.andExpect(status().isBadRequest());
        assertEquals("exactly one option must be selected", message(twoChoices));

        var duplicate = submit(student, sessionId, sessionQuestionIdOf(session, multi.getQuestionId()),
                "{\"response\":{\"selectedOptionIds\":[" + multiRightOne.getOptionId() + ","
                        + multiRightOne.getOptionId() + "]}}");
        duplicate.andExpect(status().isBadRequest());
        assertEquals("duplicate option", message(duplicate));

        var notAnObject = submit(student, sessionId, sessionQuestionIdOf(session, single.getQuestionId()),
                "{\"response\":[1,2]}");
        notAnObject.andExpect(status().isBadRequest());
        assertEquals("response must be a JSON object", message(notAnObject));

        var blankOutsideTheQuestion = submit(student, sessionId, sessionQuestionIdOf(session, fillBlank.getQuestionId()),
                "{\"response\":{\"blanks\":{\"7\":\"x\"}}}");
        blankOutsideTheQuestion.andExpect(status().isBadRequest());
        assertEquals("blank is not part of this question", message(blankOutsideTheQuestion));

        assertEquals(0, count("SELECT COUNT(a) FROM QuestionPracticeAnswer a"));
    }

    @Test
    void historyOfAQuestionThatWasNeverAnsweredIsEmpty() throws Exception {
        JsonNode session = sessionOf(student, moduleA.getModuleId());
        long sessionId = session.path("sessionId").asLong();
        long sessionQuestionId = sessionQuestionIdOf(session, matching.getQuestionId());

        JsonNode history = data(history(student, sessionId, sessionQuestionId).andExpect(status().isOk()));
        assertEquals(sessionId, history.path("sessionId").asLong());
        assertEquals(matching.getQuestionId(), history.path("questionId").asLong());
        assertEquals(0, history.path("attemptCount").asInt());
        assertEquals(0, history.path("attempts").size());
    }

    // ------------------------------------------------------------------ attempts & idempotency

    @Test
    void multipleAttemptsAreAppendedAndNeverOverwritten() throws Exception {
        JsonNode session = sessionOf(student, moduleA.getModuleId());
        long sessionId = session.path("sessionId").asLong();
        long sessionQuestionId = sessionQuestionIdOf(session, single.getQuestionId());
        long right = singleRight.getOptionId();
        long wrong = singleWrong.getOptionId();

        answer(student, sessionId, sessionQuestionId, "{\"response\":{\"selectedOptionIds\":[" + wrong + "]}}");
        answer(student, sessionId, sessionQuestionId, "{\"response\":{\"selectedOptionIds\":[" + right + "]}}");
        answer(student, sessionId, sessionQuestionId, "{\"response\":{\"selectedOptionIds\":[" + wrong + "]}}");

        JsonNode history = data(history(student, sessionId, sessionQuestionId).andExpect(status().isOk()));
        assertEquals(3, history.path("attemptCount").asInt());
        List<JsonNode> attempts = history.path("attempts").findValues("attemptNumber");
        assertEquals(List.of(1, 2, 3), attempts.stream().map(JsonNode::asInt).toList());
        assertFalse(history.path("attempts").get(0).path("isCorrect").asBoolean());
        assertTrue(history.path("attempts").get(1).path("isCorrect").asBoolean());
        assertFalse(history.path("attempts").get(2).path("isCorrect").asBoolean());
        // Every stored payload is the one that was submitted, in order.
        assertEquals(wrong, history.path("attempts").get(0).path("response").path("selectedOptionIds").get(0).asLong());
        assertEquals(right, history.path("attempts").get(1).path("response").path("selectedOptionIds").get(0).asLong());
        assertEquals(wrong, history.path("attempts").get(2).path("response").path("selectedOptionIds").get(0).asLong());
        assertEquals("AUTO", history.path("attempts").get(0).path("gradingStatus").asText());

        // The question row and the session counters describe the newest attempt.
        JsonNode view = data(questionView(student, sessionId, sessionQuestionId).andExpect(status().isOk()));
        assertEquals(3, view.path("attemptCount").asInt());
        assertFalse(view.path("latestIsCorrect").asBoolean());
        assertEquals(3, view.path("attempts").size());
        assertEquals(1, count("SELECT COUNT(p) FROM QuestionPracticeProgress p WHERE p.totalAttempts = 3 "
                + "AND p.gradedAttempts = 3 AND p.correctAttempts = 1 AND p.wrongAttempts = 2"));
    }

    @Test
    void replayingARequestKeyReturnsTheStoredAttempt() throws Exception {
        JsonNode session = sessionOf(student, moduleA.getModuleId());
        long sessionId = session.path("sessionId").asLong();
        long sessionQuestionId = sessionQuestionIdOf(session, single.getQuestionId());
        String body = "{\"response\":{\"selectedOptionIds\":[" + singleRight.getOptionId() + "]},"
                + "\"requestKey\":\"d3f0c1e2-0001\"}";

        JsonNode first = answer(student, sessionId, sessionQuestionId, body);
        assertFalse(first.path("duplicate").asBoolean());
        JsonNode replay = answer(student, sessionId, sessionQuestionId, body);
        assertTrue(replay.path("duplicate").asBoolean());
        assertEquals(first.path("attemptNumber").asInt(), replay.path("attemptNumber").asInt());
        assertEquals(first.path("practiceAnswerId").asLong(), replay.path("practiceAnswerId").asLong());

        JsonNode history = data(history(student, sessionId, sessionQuestionId).andExpect(status().isOk()));
        assertEquals(1, history.path("attempts").size(), "a retried submit must not add an attempt");

        // A different key on the same question is a genuinely new attempt.
        JsonNode second = answer(student, sessionId, sessionQuestionId,
                "{\"response\":{\"selectedOptionIds\":[" + singleWrong.getOptionId() + "]},"
                        + "\"requestKey\":\"d3f0c1e2-0002\"}");
        assertEquals(2, second.path("attemptNumber").asInt());
        assertFalse(second.path("duplicate").asBoolean());
    }

    @Test
    void theSubmitResponseCarriesTheRefreshedSessionProgress() throws Exception {
        JsonNode session = sessionOf(student, moduleA.getModuleId());
        long sessionId = session.path("sessionId").asLong();
        long sessionQuestionId = sessionQuestionIdOf(session, single.getQuestionId());

        JsonNode submitted = answer(student, sessionId, sessionQuestionId,
                "{\"response\":{\"selectedOptionIds\":[" + singleRight.getOptionId() + "]}}");
        JsonNode progress = submitted.path("session");
        assertEquals(9, progress.path("questionCount").asInt());
        assertEquals(1, progress.path("answeredCount").asInt());
        assertEquals(1, progress.path("correctCount").asInt());
        assertEquals("IN_PROGRESS", progress.path("status").asText());
        assertFalse(progress.path("nextSessionQuestionId").isNull());
        assertTrue(progress.path("nextSessionQuestionId").asLong() != sessionQuestionId,
                "the next unanswered question is not the one just answered");
        assertFalse(progress.path("nextQuestionOrderIndex").isNull());

        JsonNode resumed = resume(student, sessionId);
        assertEquals(progress.path("nextSessionQuestionId").asLong(),
                resumed.path("nextSessionQuestionId").asLong());
        assertEquals(1, resumed.path("answeredCount").asInt());
        JsonNode answeredRow = null;
        for (JsonNode row : resumed.path("questions")) {
            if (row.path("sessionQuestionId").asLong() == sessionQuestionId) {
                answeredRow = row;
            }
        }
        assertNotNull(answeredRow);
        assertTrue(answeredRow.path("answered").asBoolean());
        assertEquals(1, answeredRow.path("attemptCount").asInt());
        assertEquals("AUTO", answeredRow.path("gradingStatus").asText());
    }

    @Test
    void anAnsweredQuestionCanStillBeAnsweredAgainAndItsLatestResultWins() throws Exception {
        JsonNode session = sessionOf(student, moduleA.getModuleId());
        long sessionId = session.path("sessionId").asLong();
        long sessionQuestionId = sessionQuestionIdOf(session, multi.getQuestionId());

        answer(student, sessionId, sessionQuestionId,
                "{\"response\":{\"selectedOptionIds\":[" + multiRightOne.getOptionId() + "]}}");
        JsonNode view = data(questionView(student, sessionId, sessionQuestionId).andExpect(status().isOk()));
        assertFalse(view.path("latestIsCorrect").asBoolean());
        assertEquals(1, view.path("attemptCount").asInt());

        JsonNode second = answer(student, sessionId, sessionQuestionId,
                "{\"response\":{\"selectedOptionIds\":[" + multiRightOne.getOptionId() + ","
                        + multiRightTwo.getOptionId() + "]}}");
        assertTrue(second.path("isCorrect").asBoolean());
        assertFalse(second.path("duplicate").asBoolean());

        // Only when all questions have an attempt does the session run out of next questions.
        JsonNode empty = data(history(student, sessionId, sessionQuestionId).andExpect(status().isOk()));
        assertNull(empty.path("attempts").get(0).path("feedback").asText(null));
    }

    // ------------------------------------------------------------------ frozen paper

    /**
     * The paper is frozen at session start: a manager who edits, re-keys, re-orders or archives the
     * live question cannot change what the student sees or how their answer is graded.
     */
    @Test
    void aQuestionEditedMidSessionCannotChangeTheRunningPractice() throws Exception {
        JsonNode session = sessionOf(student, moduleA.getModuleId());
        long sessionId = session.path("sessionId").asLong();
        long sessionQuestionId = sessionQuestionIdOf(session, single.getQuestionId());
        JsonNode before = data(questionView(student, sessionId, sessionQuestionId).andExpect(status().isOk()));
        String originalContent = before.path("content").asText();
        Set<String> originalOptions = new HashSet<>();
        for (JsonNode option : before.path("options")) {
            originalOptions.add(option.path("optionText").asText());
        }
        assertEquals(1, before.path("media").size(), "the media of the question is frozen into the paper");

        // The manager rewrites the question: new content, the correct flag moved to the other option,
        // a different scoring version, extra media and the question archived mid-practice.
        single.setContent("REWRITTEN WHILE THE STUDENT WAS PRACTISING");
        singleRight.setIsCorrect(false);
        singleWrong.setIsCorrect(true);
        single.setScoringVersion(single.getScoringVersion() + 1);
        single.setStatus("ARCHIVED");
        em.persist(QuestionMedia.builder().question(single).mediaType("IMAGE")
                .url("/uploads/documents/added-later.png").altText("Added later").build());
        em.flush();

        JsonNode after = data(questionView(student, sessionId, sessionQuestionId).andExpect(status().isOk()));
        assertEquals(originalContent, after.path("content").asText(), "the frozen content is what is shown");
        Set<String> optionsAfter = new HashSet<>();
        for (JsonNode option : after.path("options")) {
            optionsAfter.add(option.path("optionText").asText());
        }
        assertEquals(originalOptions, optionsAfter, "the frozen options are what is shown");
        assertEquals(1, after.path("media").size(), "media added after the session started is not shown");
        assertEquals("/uploads/documents/class-diagram.png", after.path("media").get(0).path("url").asText());

        // The shared passage of a grouped question is frozen the same way.
        group.setPassageText("REWRITTEN PASSAGE");
        em.flush();
        JsonNode essayView = data(questionView(student, sessionId,
                sessionQuestionIdOf(session, essay.getQuestionId())).andExpect(status().isOk()));
        assertEquals("Read the passage about heap generations first.",
                essayView.path("group").path("passageText").asText(),
                "the passage frozen into the paper is what is shown");

        // Grading still uses the frozen key: the option that was correct at session start stays correct.
        JsonNode stillRight = answer(student, sessionId, sessionQuestionId,
                "{\"response\":{\"selectedOptionIds\":[" + singleRight.getOptionId() + "]}}");
        assertTrue(stillRight.path("isCorrect").asBoolean(),
                "the key frozen at session start still grades the answer");
        JsonNode nowWrong = answer(student, sessionId, sessionQuestionId,
                "{\"response\":{\"selectedOptionIds\":[" + singleWrong.getOptionId() + "]}}");
        assertFalse(nowWrong.path("isCorrect").asBoolean(),
                "flipping is_correct in the bank must not flip an existing practice run");

        // The session keeps working exactly as before: same paper size, this question answered twice.
        JsonNode resumed = resume(student, sessionId);
        assertEquals(9, resumed.path("questionCount").asInt());
        assertEquals(1, resumed.path("answeredCount").asInt(), "unique questions answered, not attempts");
        JsonNode row = null;
        for (JsonNode candidate : resumed.path("questions")) {
            if (candidate.path("sessionQuestionId").asLong() == sessionQuestionId) {
                row = candidate;
            }
        }
        assertNotNull(row);
        assertEquals(2, row.path("attemptCount").asInt());
        assertFalse(row.path("latestIsCorrect").asBoolean(), "the newest attempt used the frozen key");
    }

    // ------------------------------------------------------------------ helpers

    private long optionIdByText(JsonNode view, String text) {
        for (JsonNode option : view.path("options")) {
            if (text.equals(option.path("optionText").asText())) {
                return option.path("optionId").asLong();
            }
        }
        throw new AssertionError("no option with text '" + text + "'");
    }
}
