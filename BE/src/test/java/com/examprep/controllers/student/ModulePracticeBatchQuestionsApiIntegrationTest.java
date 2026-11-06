package com.examprep.controllers.student;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * MP-04 (batch) — several questions of one session in one call — and MP-08's
 * {@code ?includeQuestions=true}.
 *
 * <p>The point of both is that a paper of a hundred questions is opened, and its result page shown,
 * with a fixed number of requests instead of one MP-04 call per question (600–800 ms each).</p>
 */
class ModulePracticeBatchQuestionsApiIntegrationTest extends ModulePracticeTestBase {

    @Test
    void everyItemOfABatchIsExactlyTheMp04Body() throws Exception {
        JsonNode session = sessionOf(student, moduleA.getModuleId());
        long sessionId = session.path("sessionId").asLong();
        long singleRow = sessionQuestionIdOf(session, single.getQuestionId());
        long essayRow = sessionQuestionIdOf(session, essay.getQuestionId());

        JsonNode batch = data(questions(student, sessionId, singleRow + "," + essayRow)
                .andExpect(status().isOk()));

        assertEquals(2, batch.size(), "one item per requested id");
        for (JsonNode item : batch) {
            long rowId = item.path("sessionQuestionId").asLong();
            JsonNode mp04 = data(questionView(student, sessionId, rowId).andExpect(status().isOk()));
            assertEquals(mp04, item, "a batch item carries exactly MP-04's body");
            assertEquals(session.path("questionCount").asInt(), item.path("questionsTotal").asInt());
        }

        JsonNode essayItem = rowOf(batch, essayRow);
        assertEquals("Read the passage about heap generations first.",
                essayItem.path("group").path("passageText").asText(), "the frozen passage travels too");
        assertTrue(essayItem.path("correctAnswer").isNull(), "a rubric question carries no key");

        JsonNode singleItem = rowOf(batch, singleRow);
        assertEquals(singleRight.getOptionId(),
                singleItem.path("correctAnswer").path("correctOptionIds").get(0).asLong());
        assertEquals(1, singleItem.path("media").size(), "the frozen media travels too");
    }

    @Test
    void aBatchCarriesTheAttemptsAndTheBookmarkOfEveryQuestion() throws Exception {
        JsonNode session = sessionOf(student, moduleA.getModuleId());
        long sessionId = session.path("sessionId").asLong();
        long singleRow = sessionQuestionIdOf(session, single.getQuestionId());
        long multiRow = sessionQuestionIdOf(session, multi.getQuestionId());
        answer(student, sessionId, singleRow,
                "{\"response\":{\"selectedOptionIds\":[" + singleWrong.getOptionId() + "]}}");

        JsonNode batch = data(questions(student, sessionId, singleRow + "," + multiRow)
                .andExpect(status().isOk()));

        JsonNode answeredRow = rowOf(batch, singleRow);
        assertEquals(1, answeredRow.path("attempts").size(), "only the answered question carries one");
        assertEquals(singleWrong.getOptionId(), answeredRow.path("attempts").get(0)
                .path("response").path("selectedOptionIds").get(0).asLong());
        assertFalse(answeredRow.path("latestIsCorrect").asBoolean());
        assertEquals("AUTO", answeredRow.path("gradingStatus").asText());
        assertTrue(answeredRow.path("isBookmarked").asBoolean(), "the notebook bookmark travels with the item");

        JsonNode untouchedRow = rowOf(batch, multiRow);
        assertEquals(0, untouchedRow.path("attempts").size());
        assertFalse(untouchedRow.path("isBookmarked").asBoolean());
    }

    @Test
    void aBatchOfMoreThanTwentyIdsOrOfNoIdsIsRefused() throws Exception {
        JsonNode session = sessionOf(student, moduleA.getModuleId());
        long sessionId = session.path("sessionId").asLong();

        StringBuilder tooMany = new StringBuilder();
        for (long id = 1; id <= 21; id++) {
            tooMany.append(id == 1 ? "" : ",").append(id);
        }
        var refused = questions(student, sessionId, tooMany.toString()).andExpect(status().isBadRequest());
        assertTrue(message(refused).contains("20"), message(refused));

        var missing = questions(student, sessionId, null).andExpect(status().isBadRequest());
        assertEquals("ids must name at least one question of this practice session", message(missing));
    }

    @Test
    void aQuestionOutsideTheSessionIsNotFound() throws Exception {
        JsonNode first = sessionOf(student, moduleA.getModuleId());
        long firstSessionId = first.path("sessionId").asLong();
        long row = sessionQuestionIdOf(first, single.getQuestionId());
        long otherRow = sessionQuestionIdOf(first, multi.getQuestionId());
        complete(student, firstSessionId).andExpect(status().isOk());

        JsonNode second = data(startSession(student, moduleA.getModuleId(), "{}")
                .andExpect(status().isCreated()));
        long secondSessionId = second.path("sessionId").asLong();

        // The id belongs to another session the student owns.
        questions(student, secondSessionId, String.valueOf(row)).andExpect(status().isNotFound());
        // One unknown id fails the whole call, exactly like MP-04 does for a single id.
        questions(student, firstSessionId, otherRow + ",99999999").andExpect(status().isNotFound());
    }

    @Test
    void aBatchOfAnotherStudentsSessionIsNotFound() throws Exception {
        JsonNode session = sessionOf(student, moduleA.getModuleId());
        long sessionId = session.path("sessionId").asLong();
        String ids = String.valueOf(sessionQuestionIdOf(session, single.getQuestionId()));

        questions(otherStudent, sessionId, ids).andExpect(status().isNotFound());
    }

    @Test
    void theResultCanCarryTheMp04BodyOfEveryQuestion() throws Exception {
        JsonNode session = sessionOf(student, moduleB.getModuleId());
        long sessionId = session.path("sessionId").asLong();
        long answeredRow = sessionQuestionIdOf(session, moduleBQuestions.get(0).getQuestionId());

        JsonNode view = rowOf(data(questions(student, sessionId, String.valueOf(answeredRow))
                .andExpect(status().isOk())), answeredRow);
        long rightOption = 0;
        for (JsonNode option : view.path("options")) {
            if ("right".equals(option.path("optionText").asText())) {
                rightOption = option.path("optionId").asLong();
            }
        }
        answer(student, sessionId, answeredRow,
                "{\"response\":{\"selectedOptionIds\":[" + rightOption + "]}}");
        complete(student, sessionId).andExpect(status().isOk());

        JsonNode plain = data(result(student, sessionId).andExpect(status().isOk()));
        for (JsonNode row : plain.path("questions")) {
            assertTrue(row.path("question").isNull(), "a plain MP-08 carries no question content");
        }

        JsonNode withQuestions = data(resultIncludingQuestions(student, sessionId).andExpect(status().isOk()));
        assertEquals(plain.path("questions").size(), withQuestions.path("questions").size());
        assertEquals(plain.path("answeredQuestions").asInt(), withQuestions.path("answeredQuestions").asInt(),
                "the statistics are the same, the content is only added");
        for (JsonNode row : withQuestions.path("questions")) {
            JsonNode detail = row.path("question");
            assertEquals(row.path("sessionQuestionId").asLong(), detail.path("sessionQuestionId").asLong());
            assertEquals(row.path("questionId").asLong(), detail.path("questionId").asLong());
            assertEquals(row.path("attemptCount").asInt(), detail.path("attemptCount").asInt());
            assertEquals(row.path("latestIsCorrect"), detail.path("latestIsCorrect"));
            assertFalse(detail.path("content").asText().isBlank());
            JsonNode mp04 = data(questionView(student, sessionId, row.path("sessionQuestionId").asLong())
                    .andExpect(status().isOk()));
            assertEquals(mp04, detail, "the attached body is exactly MP-04's");
        }

        JsonNode answeredDetail = rowOf(withQuestions.path("questions"), answeredRow).path("question");
        assertEquals(1, answeredDetail.path("attempts").size(), "the student's own attempt travels along");
        assertTrue(answeredDetail.path("latestIsCorrect").asBoolean());
    }

    private static JsonNode rowOf(JsonNode array, long sessionQuestionId) {
        for (JsonNode item : array) {
            if (item.path("sessionQuestionId").asLong() == sessionQuestionId) {
                return item;
            }
        }
        throw new AssertionError("no row for session question " + sessionQuestionId);
    }
}
