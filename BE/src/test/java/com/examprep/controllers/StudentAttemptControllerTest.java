package com.examprep.controllers;

import com.examprep.entities.AnswerOption;
import com.examprep.entities.AttemptAnswer;
import com.examprep.entities.AttemptStartKey;
import com.examprep.entities.Category;
import com.examprep.entities.Course;
import com.examprep.entities.Enrollment;
import com.examprep.entities.Exam;
import com.examprep.entities.ExamAttempt;
import com.examprep.entities.ExamConfig;
import com.examprep.entities.ExamQuestion;
import com.examprep.entities.Module;
import com.examprep.entities.Question;
import com.examprep.entities.User;
import com.examprep.security.UserPrincipal;
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
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * End-to-end contract tests of the seven student attempt APIs (spec 6.1-6.5, 5.2).
 *
 * <p>The paper used by most tests has three questions with weights 1 / 2 / 2 and maxScore 10, so
 * P_q is 2.00 / 4.00 / 4.00 exactly as in the worked example of spec section 1.</p>
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class StudentAttemptControllerTest {

    private static final BigDecimal MAX_SCORE = BigDecimal.TEN;
    private static final int DURATION_MINUTES = 45;

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired EntityManager em;

    User manager;
    User student;
    User otherStudent;
    Course course;
    Module module;
    Question single;
    AnswerOption singleWrong;
    AnswerOption singleRight;
    Question multiple;
    AnswerOption multipleA;
    AnswerOption multipleB;
    AnswerOption multipleC;
    Question essay;
    Exam mainExam;

    @BeforeEach
    void fixtures() {
        manager = account("COURSE_MANAGER");
        student = account("STUDENT");
        otherStudent = account("STUDENT");

        Category category = Category.builder().name("Attempt category").slug(UUID.randomUUID().toString()).build();
        em.persist(category);
        course = Course.builder().manager(manager).category(category).categoryId(category.getCategoryId())
                .title("Java course").slug(UUID.randomUUID().toString()).isPublished(true).build();
        em.persist(course);
        module = Module.builder().course(course).title("Module 1").orderIndex(1).build();
        em.persist(module);
        enroll(student, course);
        enroll(otherStudent, course);

        single = question("SINGLE_CHOICE", "Which language runs on the JVM?");
        singleWrong = option(single, "Python", false, 0);
        singleRight = option(single, "Java", true, 1);
        multiple = question("MULTIPLE_CHOICE", "Which of these run on the JVM?");
        multipleA = option(multiple, "Kotlin", true, 0);
        multipleB = option(multiple, "Scala", true, 1);
        multipleC = option(multiple, "Rust", false, 2);
        essay = question("ESSAY", "Explain garbage collection.");
        essay.setEssayGradingRubric("{\"criteria\":[{\"name\":\"Memory management\",\"weight\":60},"
                + "{\"name\":\"Trade-off\",\"weight\":40}]}");

        mainExam = exam("Midterm", "STATIC");
        attach(mainExam, single, "1");
        attach(mainExam, multiple, "2");
        attach(mainExam, essay, "2");
        em.flush();
    }

    // =================================================================================
    // SA-01
    // =================================================================================

    @Test
    void startsAnAttemptAndFreezesTheWholePaper() throws Exception {
        MvcResult result = call(student, post(startUrl(mainExam)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.message").value("Attempt started"))
                .andExpect(jsonPath("$.data.status").value("IN_PROGRESS"))
                .andExpect(jsonPath("$.data.answers").doesNotExist())
                .andExpect(jsonPath("$.data.questions.length()").value(3))
                .andReturn();

        JsonNode data = data(result);
        assertNotNull(data.path("attemptId").asLong());
        assertEquals(mainExam.getExamId(), data.path("examId").asLong());
        assertEquals("Midterm", data.path("title").asText());
        assertEquals(0, MAX_SCORE.compareTo(data.path("maxScore").decimalValue()));
        Instant start = Instant.parse(data.path("startTime").asText());
        Instant deadline = Instant.parse(data.path("deadlineAt").asText());
        assertEquals(DURATION_MINUTES * 60, deadline.getEpochSecond() - start.getEpochSecond());
        assertNotNull(data.path("serverTime").textValue());

        // Questions are shuffled, but every question appears once with a 1-based position.
        Set<Long> expected = Set.of(single.getQuestionId(), multiple.getQuestionId(), essay.getQuestionId());
        Set<Long> actual = new HashSet<>();
        Set<Integer> positions = new HashSet<>();
        for (JsonNode question : data.path("questions")) {
            actual.add(question.path("questionId").asLong());
            positions.add(question.path("orderIndex").asInt());
        }
        assertEquals(expected, actual);
        assertEquals(Set.of(1, 2, 3), positions);

        JsonNode first = question(data, single.getQuestionId());
        assertEquals("SINGLE_CHOICE", first.path("questionType").asText());
        assertEquals(2, first.path("options").size());
        assertEquals(0, BigDecimal.valueOf(2).compareTo(first.path("maxPoints").decimalValue()));
        for (JsonNode option : first.path("options")) {
            assertTrue(option.has("optionId"));
            assertTrue(option.has("optionText"));
            assertFalse(option.has("isCorrectAnswer"), "the correct option must never leak before submit");
        }

        JsonNode runtimeEssay = question(data, essay.getQuestionId());
        assertEquals(0, BigDecimal.valueOf(4).compareTo(runtimeEssay.path("maxPoints").decimalValue()));
        assertEquals(10_000, runtimeEssay.path("answerSpace").path("maxLength").asInt());

        JsonNode multipleJson = question(data, multiple.getQuestionId());
        assertEquals(0, BigDecimal.valueOf(4).compareTo(multipleJson.path("maxPoints").decimalValue()));

        // The paper is frozen in the database, one row per question, with both snapshots.
        ExamAttempt attempt = attempt(data.path("attemptId").asLong());
        assertEquals("IN_PROGRESS", attempt.getStatus());
        assertNotNull(attempt.getExamSnapshot());
        assertTrue(attempt.getExamSnapshot().contains("shuffleSeed"));
        List<AttemptAnswer> rows = answers(attempt.getAttemptId());
        assertEquals(3, rows.size());
        for (AttemptAnswer row : rows) {
            assertNotNull(row.getDisplaySnapshot());
            assertNotNull(row.getKeySnapshot());
            assertTrue(row.getWeightSnapshot().signum() > 0);
            assertEquals("AUTO", row.getGradingStatus());
            assertEquals(-1, row.getDraftSeq().intValue(), "a new row has no draft yet");
        }

        assertNoAnswerLeak(body(result).toString());
    }

    @Test
    void startRequiresAStudentToken() throws Exception {
        mvc.perform(post(startUrl(mainExam))).andExpect(status().isUnauthorized());
        call(manager, post(startUrl(mainExam))).andExpect(status().isForbidden());
    }

    @Test
    void startChecksEnrollmentAndExistenceBeforeCreatingAnything() throws Exception {
        User outsider = account("STUDENT");
        call(outsider, post(startUrl(mainExam))).andExpect(status().isForbidden());
        call(student, post("/api/v1/student/exams/999999/attempts")).andExpect(status().isNotFound());
        assertEquals(0, attempts().size());
    }

    @Test
    void startRefusesUnpublishedExams() throws Exception {
        mainExam.setStatus("DRAFT");
        call(student, post(startUrl(mainExam))).andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value("Exam is not published"));
        assertEquals(0, attempts().size());
    }

    @Test
    void aSecondStartReturnsTheActiveAttemptIdAndDeadline() throws Exception {
        long attemptId = data(call(student, post(startUrl(mainExam))).andExpect(status().isCreated()))
                .path("attemptId").asLong();

        call(student, post(startUrl(mainExam)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value("An attempt is already in progress for this exam"))
                .andExpect(jsonPath("$.data.activeAttemptId").value(attemptId))
                .andExpect(jsonPath("$.data.deadlineAt").exists());
        assertEquals(1, attempts().size());
    }

    @Test
    void anIdempotencyKeyReplaysTheOriginalAttempt() throws Exception {
        String key = UUID.randomUUID().toString();
        MvcResult first = call(student, post(startUrl(mainExam)).header("Idempotency-Key", key))
                .andExpect(status().isCreated()).andReturn();
        MvcResult replay = call(student, post(startUrl(mainExam)).header("Idempotency-Key", key))
                .andExpect(status().isCreated()).andReturn();

        assertEquals(data(first).path("attemptId").asLong(), data(replay).path("attemptId").asLong());
        assertEquals(1, attempts().size());
        assertEquals(1, count(AttemptStartKey.class));
        AttemptStartKey stored = em.createQuery("select k from AttemptStartKey k", AttemptStartKey.class)
                .getSingleResult();
        assertTrue(stored.getExpiresAt().isAfter(stored.getCreatedAt()));
    }

    @Test
    void anIdempotencyKeyIsBoundToOneExam() throws Exception {
        String key = UUID.randomUUID().toString();
        call(student, post(startUrl(mainExam)).header("Idempotency-Key", key)).andExpect(status().isCreated());
        Exam second = exam("Second", "STATIC");
        attach(second, question("ESSAY", "Another essay"), "1");
        em.flush();

        call(student, post(startUrl(second)).header("Idempotency-Key", key)).andExpect(status().isConflict());
        assertEquals(1, attempts().size());
    }

    @Test
    void startRejectsAnExamWithoutQuestions() throws Exception {
        Exam empty = exam("Empty", "STATIC");
        call(student, post(startUrl(empty))).andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.message").value("Exam has no questions"));
        assertEquals(0, attempts().size());
    }

    @Test
    void startListsEveryInvalidQuestion() throws Exception {
        Question inactive = question("TRUE_FALSE", "The sky is green.");
        option(inactive, "True", false, 0);
        option(inactive, "False", true, 1);
        attach(mainExam, inactive, "1");
        em.flush();
        inactive.setStatus("INACTIVE");

        call(student, post(startUrl(mainExam)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value("Some questions of this exam are no longer valid"))
                .andExpect(jsonPath("$.data.invalidQuestionIds[0]").value(inactive.getQuestionId()));
        assertEquals(0, attempts().size());
    }

    @Test
    void startDrawsTheConfiguredNumberOfQuestionsForARandomExam() throws Exception {
        Question extraEssay = question("ESSAY", "Second essay in the bank");
        em.flush();
        Exam random = exam("Random", "RANDOM");
        em.persist(ExamConfig.builder().exam(random).questionType("ESSAY").numberOfQuestions(2)
                .module(module).weightEach(BigDecimal.valueOf(2)).build());
        em.flush();

        JsonNode data = data(call(student, post(startUrl(random))).andExpect(status().isCreated()));
        assertEquals(2, data.path("questions").size());
        Set<Long> drawn = new HashSet<>();
        for (JsonNode question : data.path("questions")) {
            drawn.add(question.path("questionId").asLong());
        }
        assertEquals(Set.of(essay.getQuestionId(), extraEssay.getQuestionId()), drawn);
        // weight_each = 2 for both drawn questions, maxScore 10 → 5.00 each.
        for (JsonNode question : data.path("questions")) {
            assertEquals(0, BigDecimal.valueOf(5).compareTo(question.path("maxPoints").decimalValue()));
        }
    }

    @Test
    void startReportsAnUnfillableRandomRuleAsInvalidQuestions() throws Exception {
        Exam random = exam("Random too big", "RANDOM");
        em.persist(ExamConfig.builder().exam(random).questionType("ESSAY").numberOfQuestions(5)
                .module(module).weightEach(BigDecimal.ONE).build());
        em.flush();

        call(student, post(startUrl(random)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value("Some questions of this exam are no longer valid"))
                .andExpect(jsonPath("$.data.invalidQuestionIds").isEmpty());
        assertEquals(0, attempts().size());
    }

    @Test
    void anExpiredActiveAttemptIsClosedBeforeANewOneStarts() throws Exception {
        long first = data(call(student, post(startUrl(mainExam))).andExpect(status().isCreated()))
                .path("attemptId").asLong();
        attempt(first).setDeadlineAt(Instant.now().minusSeconds(30));

        JsonNode fresh = data(call(student, post(startUrl(mainExam))).andExpect(status().isCreated()));
        assertTrue(fresh.path("attemptId").asLong() != first);
        assertEquals("COMPLETED", attempt(first).getStatus());
        assertNotNull(attempt(first).getSubmittedAt());
        assertEquals(2, attempts().size());
    }

    // =================================================================================
    // SA-02
    // =================================================================================

    @Test
    void reloadReturnsTheSamePaperPlusTheStoredDrafts() throws Exception {
        JsonNode started = data(call(student, post(startUrl(mainExam))).andExpect(status().isCreated()));
        long attemptId = started.path("attemptId").asLong();
        save(attemptId, draft(single.getQuestionId(), 1, selected(singleRight.getOptionId())))
                .andExpect(status().isOk());

        JsonNode reloaded = data(call(student, get(attemptUrl(attemptId))).andExpect(status().isOk()));
        assertEquals(attemptId, reloaded.path("attemptId").asLong());
        assertEquals(questionIds(started), questionIds(reloaded));
        assertEquals(orderIndexes(started), orderIndexes(reloaded));

        JsonNode answer = answerOf(reloaded, single.getQuestionId());
        assertEquals(1, answer.path("draftSeq").asInt());
        assertEquals(singleRight.getOptionId(),
                answer.path("response").path("selectedOptionIds").get(0).asLong());

        JsonNode untouched = answerOf(reloaded, essay.getQuestionId());
        assertEquals(-1, untouched.path("draftSeq").asInt());
        assertTrue(untouched.path("response").isNull() || untouched.path("response").isMissingNode());
    }

    @Test
    void reloadIsForbiddenForAnotherStudentAnd404ForAnUnknownAttempt() throws Exception {
        long attemptId = data(call(student, post(startUrl(mainExam))).andExpect(status().isCreated()))
                .path("attemptId").asLong();
        call(otherStudent, get(attemptUrl(attemptId))).andExpect(status().isForbidden());
        call(student, get("/api/v1/student/attempts/999999")).andExpect(status().isNotFound());
    }

    @Test
    void reloadingAfterTheDeadlineReturnsTheAutoSubmittedAttempt() throws Exception {
        long attemptId = data(call(student, post(startUrl(mainExam))).andExpect(status().isCreated()))
                .path("attemptId").asLong();
        save(attemptId, draft(single.getQuestionId(), 1, selected(singleRight.getOptionId())))
                .andExpect(status().isOk());
        attempt(attemptId).setDeadlineAt(Instant.now().minusSeconds(30));

        JsonNode reloaded = data(call(student, get(attemptUrl(attemptId))).andExpect(status().isOk()));
        assertEquals("COMPLETED", reloaded.path("status").asText());
        assertNotNull(attempt(attemptId).getSubmittedAt(), "the server closed the attempt");
        assertTrue(reloaded.has("questions"));
        assertEquals(3, reloaded.path("answers").size(),
                "a submitted attempt still exposes what was answered, without the key");
        assertEquals(1, answerOf(reloaded, single.getQuestionId()).path("draftSeq").asInt());

        assertNoAnswerLeak(body(call(student, get(attemptUrl(attemptId))).andExpect(status().isOk())).toString());
    }

    // =================================================================================
    // SA-03
    // =================================================================================

    @Test
    void aBatchStoresValidEntriesAndReportsTheRestPerEntry() throws Exception {
        long attemptId = data(call(student, post(startUrl(mainExam))).andExpect(status().isCreated()))
                .path("attemptId").asLong();

        List<Map<String, Object>> drafts = List.of(
                draft(single.getQuestionId(), 1, selected(singleRight.getOptionId())),
                draft(999_999L, 1, selected(1L)),
                draft(multiple.getQuestionId(), 1, Map.of("selectedOptionIds", List.of(
                        multipleA.getOptionId(), multipleA.getOptionId()))));

        JsonNode data = data(call(student, put(answersUrl(attemptId))
                .contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("answers", drafts))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.message").value("Draft saved")));

        assertEquals(1, data.path("saved").size());
        assertEquals(single.getQuestionId(), data.path("saved").get(0).path("questionId").asLong());
        assertEquals(2, data.path("rejected").size());
        assertEquals("NOT_IN_ATTEMPT", data.path("rejected").get(0).path("reason").asText());
        assertEquals("INVALID_RESPONSE", data.path("rejected").get(1).path("reason").asText());
        assertNotNull(data.path("deadlineAt").textValue());

        AttemptAnswer saved = answer(attemptId, single.getQuestionId());
        assertEquals(1, saved.getDraftSeq().intValue());
        assertTrue(saved.getResponse().contains(String.valueOf(singleRight.getOptionId())));
        assertNull(answer(attemptId, multiple.getQuestionId()).getResponse());
    }

    @Test
    void anOlderSequenceNeverOverwritesANewerDraft() throws Exception {
        long attemptId = data(call(student, post(startUrl(mainExam))).andExpect(status().isCreated()))
                .path("attemptId").asLong();
        save(attemptId, draft(single.getQuestionId(), 5, selected(singleRight.getOptionId())))
                .andExpect(status().isOk());

        JsonNode data = data(save(attemptId,
                draft(single.getQuestionId(), 3, selected(singleWrong.getOptionId())))
                .andExpect(status().isOk()));
        assertEquals(5, data.path("saved").get(0).path("draftSeq").asInt());

        AttemptAnswer stored = answer(attemptId, single.getQuestionId());
        assertEquals(5, stored.getDraftSeq().intValue());
        assertTrue(stored.getResponse().contains(String.valueOf(singleRight.getOptionId())));
        assertFalse(stored.getResponse().contains(String.valueOf(singleWrong.getOptionId())));
    }

    @Test
    void theVeryFirstDraftMayStartAtSequenceZero() throws Exception {
        long attemptId = data(call(student, post(startUrl(mainExam))).andExpect(status().isCreated()))
                .path("attemptId").asLong();
        save(attemptId, draft(single.getQuestionId(), 0, selected(singleRight.getOptionId())))
                .andExpect(status().isOk());
        assertEquals(0, answer(attemptId, single.getQuestionId()).getDraftSeq().intValue());
        assertNotNull(answer(attemptId, single.getQuestionId()).getResponse());
    }

    @Test
    void draftValidationRejectsTooManyEntriesAndMissingSequence() throws Exception {
        long attemptId = data(call(student, post(startUrl(mainExam))).andExpect(status().isCreated()))
                .path("attemptId").asLong();

        List<Map<String, Object>> tooMany = new ArrayList<>();
        for (int i = 0; i < 51; i++) {
            tooMany.add(draft(single.getQuestionId(), i + 1, selected(singleRight.getOptionId())));
        }
        call(student, put(answersUrl(attemptId)).contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("answers", tooMany))))
                .andExpect(status().isBadRequest());

        call(student, put(answersUrl(attemptId)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"answers\":[{\"questionId\":" + single.getQuestionId()
                        + ",\"response\":{\"selectedOptionIds\":[" + singleRight.getOptionId() + "]}}]}"))
                .andExpect(status().isBadRequest());

        call(student, put(answersUrl(attemptId)).contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void savingAfterSubmitIsAConflict() throws Exception {
        long attemptId = data(call(student, post(startUrl(mainExam))).andExpect(status().isCreated()))
                .path("attemptId").asLong();
        call(student, post(submitUrl(attemptId))).andExpect(status().isOk());

        save(attemptId, draft(single.getQuestionId(), 2, selected(singleRight.getOptionId())))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value("Attempt has already been submitted"));
    }

    @Test
    void savingPastTheGracePeriodReturns410AfterAutoSubmitting() throws Exception {
        long attemptId = data(call(student, post(startUrl(mainExam))).andExpect(status().isCreated()))
                .path("attemptId").asLong();
        attempt(attemptId).setDeadlineAt(Instant.now().minusSeconds(30));

        save(attemptId, draft(single.getQuestionId(), 1, selected(singleRight.getOptionId())))
                .andExpect(status().isGone())
                .andExpect(jsonPath("$.message").value("The attempt deadline has passed"));
        assertEquals("COMPLETED", attempt(attemptId).getStatus());
    }

    @Test
    void savingRightAfterTheDeadlineStillWorksInsideTheGracePeriod() throws Exception {
        long attemptId = data(call(student, post(startUrl(mainExam))).andExpect(status().isCreated()))
                .path("attemptId").asLong();
        attempt(attemptId).setDeadlineAt(Instant.now().minusSeconds(1));

        save(attemptId, draft(single.getQuestionId(), 1, selected(singleRight.getOptionId())))
                .andExpect(status().isOk());
        assertEquals("IN_PROGRESS", attempt(attemptId).getStatus());
    }

    // =================================================================================
    // SA-04
    // =================================================================================

    @Test
    void submitGradesQuizAnswersAndLeavesTheRubricForTheWorker() throws Exception {
        long attemptId = data(call(student, post(startUrl(mainExam))).andExpect(status().isCreated()))
                .path("attemptId").asLong();
        call(student, post(submitUrl(attemptId)).contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("answers", List.of(
                        draft(single.getQuestionId(), 1, selected(singleRight.getOptionId())),
                        draft(multiple.getQuestionId(), 1,
                                selected(multipleA.getOptionId(), multipleB.getOptionId())),
                        draft(essay.getQuestionId(), 1, Map.of("text", "Generations, not objects.")))))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.message").value("Submitted"))
                .andExpect(jsonPath("$.data.status").value("SUBMITTED"))
                .andExpect(jsonPath("$.data.totalScore").value(6.00))
                .andExpect(jsonPath("$.data.pendingPoints").value(4.00))
                .andExpect(jsonPath("$.data.maxScore").value(10))
                .andExpect(jsonPath("$.data.autoSubmitted").value(false));

        ExamAttempt attempt = attempt(attemptId);
        assertEquals("SUBMITTED", attempt.getStatus());
        assertNotNull(attempt.getSubmittedAt());
        assertEquals(0, new BigDecimal("6.00").compareTo(attempt.getTotalScore()));
        assertEquals("AUTO", answer(attemptId, single.getQuestionId()).getGradingStatus());
        assertEquals("PENDING_AI", answer(attemptId, essay.getQuestionId()).getGradingStatus());
        assertNull(answer(attemptId, essay.getQuestionId()).getScoreEarned());
        assertNotNull(answer(attemptId, essay.getQuestionId()).getResponse());
    }

    @Test
    void aWrongAnswerScoresZeroAndABlankRubricQuestionDoesNotWaitForTheAi() throws Exception {
        long attemptId = data(call(student, post(startUrl(mainExam))).andExpect(status().isCreated()))
                .path("attemptId").asLong();
        call(student, post(submitUrl(attemptId)).contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("answers", List.of(
                        draft(single.getQuestionId(), 1, selected(singleWrong.getOptionId())),
                        draft(multiple.getQuestionId(), 1, selected(multipleA.getOptionId())))))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("COMPLETED"))
                .andExpect(jsonPath("$.data.totalScore").value(0.00))
                .andExpect(jsonPath("$.data.pendingPoints").value(0.00));

        assertEquals(0, answer(attemptId, single.getQuestionId()).getScoreEarned().signum());
        assertFalse(answer(attemptId, single.getQuestionId()).getIsCorrect());
        assertEquals("AUTO", answer(attemptId, essay.getQuestionId()).getGradingStatus());
        assertEquals(0, answer(attemptId, essay.getQuestionId()).getScoreEarned().signum());
    }

    @Test
    void gradesFillBlankMatchingAndOrderingAllOrNothing() throws Exception {
        Question fill = question("FILL_BLANK", "Java classes {{1}} and interfaces {{2}}.");
        fill.setAnswerKey("{\"blanks\":[{\"index\":1,\"accepted\":[\"extends\"],\"caseSensitive\":false},"
                + "{\"index\":2,\"accepted\":[\"implements\"],\"caseSensitive\":false}]}");
        Question matching = question("MATCHING", "Match each language to its role.");
        matching.setAnswerKey("{\"pairs\":[{\"left\":\"HTML\",\"right\":\"Markup\"},"
                + "{\"left\":\"CSS\",\"right\":\"Styles\"}]}");
        Question ordering = question("ORDERING", "Order the JVM phases.");
        AnswerOption compile = option(ordering, "Compile", false, 0);
        AnswerOption run = option(ordering, "Run", false, 1);
        AnswerOption load = option(ordering, "Load", false, 2);
        ordering.setAnswerKey("{\"correctOrder\":[" + load.getOptionId() + ","
                + compile.getOptionId() + "," + run.getOptionId() + "]}");

        Exam knowledge = exam("Knowledge", "STATIC", BigDecimal.valueOf(9));
        attach(knowledge, fill, "1");
        attach(knowledge, matching, "1");
        attach(knowledge, ordering, "1");
        em.flush();

        JsonNode session = data(call(student, post(startUrl(knowledge))).andExpect(status().isCreated()));
        long attemptId = session.path("attemptId").asLong();
        assertEquals(2, question(session, matching.getQuestionId()).path("matching").path("lefts").size());
        assertEquals(2, question(session, matching.getQuestionId()).path("matching").path("rights").size());
        assertEquals(3, question(session, ordering.getQuestionId()).path("options").size());

        call(student, post(submitUrl(attemptId)).contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("answers", List.of(
                        draft(fill.getQuestionId(), 1, Map.of("blanks", Map.of("1", "extends", "2", "Implements"))),
                        draft(matching.getQuestionId(), 1, Map.of("matches", List.of(
                                Map.of("left", "HTML", "right", "Markup"),
                                Map.of("left", "CSS", "right", "Styles")))),
                        draft(ordering.getQuestionId(), 1, Map.of("orderedOptionIds", List.of(
                                load.getOptionId(), compile.getOptionId(), run.getOptionId()))))))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("COMPLETED"))
                .andExpect(jsonPath("$.data.totalScore").value(9.00))
                .andExpect(jsonPath("$.data.pendingPoints").value(0.00));

        assertTrue(answer(attemptId, fill.getQuestionId()).getIsCorrect());
        assertTrue(answer(attemptId, matching.getQuestionId()).getIsCorrect());
        assertTrue(answer(attemptId, ordering.getQuestionId()).getIsCorrect());
        assertEquals(0, new BigDecimal("3.00").compareTo(answer(attemptId, fill.getQuestionId()).getScoreEarned()));
    }

    @Test
    void aPartiallyCorrectFillBlankScoresZero() throws Exception {
        Question fill = question("FILL_BLANK", "Java classes {{1}} and interfaces {{2}}.");
        fill.setAnswerKey("{\"blanks\":[{\"index\":1,\"accepted\":[\"extends\"],\"caseSensitive\":false},"
                + "{\"index\":2,\"accepted\":[\"implements\"],\"caseSensitive\":false}]}");
        Exam knowledge = exam("Fill", "STATIC", BigDecimal.TEN);
        attach(knowledge, fill, "1");
        em.flush();

        long attemptId = data(call(student, post(startUrl(knowledge))).andExpect(status().isCreated()))
                .path("attemptId").asLong();
        call(student, post(submitUrl(attemptId)).contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("answers", List.of(
                        draft(fill.getQuestionId(), 1, Map.of("blanks", Map.of("1", "extends"))))))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("COMPLETED"))
                .andExpect(jsonPath("$.data.totalScore").value(0.00));
        assertFalse(answer(attemptId, fill.getQuestionId()).getIsCorrect());
    }

    @Test
    void aPartialMultipleChoiceAnswerScoresZero() throws Exception {
        long attemptId = data(call(student, post(startUrl(mainExam))).andExpect(status().isCreated()))
                .path("attemptId").asLong();
        call(student, post(submitUrl(attemptId)).contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("answers", List.of(
                        draft(multiple.getQuestionId(), 1, selected(multipleA.getOptionId())))))))
                .andExpect(status().isOk());
        assertFalse(answer(attemptId, multiple.getQuestionId()).getIsCorrect());
        assertEquals(0, answer(attemptId, multiple.getQuestionId()).getScoreEarned().signum());
    }

    @Test
    void submittingTwiceReturnsTheSameResultWithoutGradingAgain() throws Exception {
        long attemptId = data(call(student, post(startUrl(mainExam))).andExpect(status().isCreated()))
                .path("attemptId").asLong();
        JsonNode first = data(call(student, post(submitUrl(attemptId))).andExpect(status().isOk()));
        JsonNode second = data(call(student, post(submitUrl(attemptId))).andExpect(status().isOk()));

        assertEquals(first.path("totalScore").decimalValue(), second.path("totalScore").decimalValue());
        assertEquals(first.path("status").asText(), second.path("status").asText());
        assertEquals(first.path("submittedAt").asText(), second.path("submittedAt").asText());
    }

    @Test
    void aLateSubmitIsMarkedAutoSubmitted() throws Exception {
        long attemptId = data(call(student, post(startUrl(mainExam))).andExpect(status().isCreated()))
                .path("attemptId").asLong();
        attempt(attemptId).setDeadlineAt(Instant.now().minusSeconds(30));

        call(student, post(submitUrl(attemptId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.autoSubmitted").value(true));
        assertTrue(attempt(attemptId).getAutoSubmitted());
    }

    @Test
    void submitIgnoresQuestionsThatAreNotPartOfTheAttempt() throws Exception {
        long attemptId = data(call(student, post(startUrl(mainExam))).andExpect(status().isCreated()))
                .path("attemptId").asLong();
        call(student, post(submitUrl(attemptId)).contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("answers", List.of(
                        draft(single.getQuestionId(), 1, selected(singleRight.getOptionId())),
                        draft(999_999L, 1, selected(1L)))))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalScore").value(2.00));
        assertEquals(3, answers(attemptId).size());
    }

    @Test
    void submitIsForbiddenForAnotherStudent() throws Exception {
        long attemptId = data(call(student, post(startUrl(mainExam))).andExpect(status().isCreated()))
                .path("attemptId").asLong();
        call(otherStudent, post(submitUrl(attemptId))).andExpect(status().isForbidden());
        call(student, post("/api/v1/student/attempts/999999/submit")).andExpect(status().isNotFound());
    }

    // =================================================================================
    // SA-05
    // =================================================================================

    @Test
    void resultIsAConflictWhileTheAttemptIsStillRunning() throws Exception {
        long attemptId = data(call(student, post(startUrl(mainExam))).andExpect(status().isCreated()))
                .path("attemptId").asLong();
        call(student, get(resultUrl(attemptId)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value("Attempt has not been submitted yet"))
                .andExpect(jsonPath("$.data.status").value("IN_PROGRESS"));
    }

    @Test
    void resultShowsPointsCorrectnessAndTheCachedExplanation() throws Exception {
        long attemptId = submittedAttempt(true);
        single.setAiExplanation("Java is compiled to bytecode.");
        single.setAiExplanationSource("MANAGER");
        em.flush();

        JsonNode data = data(call(student, get(resultUrl(attemptId))).andExpect(status().isOk()));
        assertEquals(attemptId, data.path("attemptId").asLong());
        assertEquals("Midterm", data.path("examTitle").asText());
        assertEquals("SUBMITTED", data.path("status").asText());
        assertEquals(0, new BigDecimal("6.00").compareTo(data.path("totalScore").decimalValue()));
        assertEquals(0, new BigDecimal("4.00").compareTo(data.path("pendingPoints").decimalValue()));
        assertEquals(3, data.path("questions").size());

        JsonNode singleResult = question(data, single.getQuestionId());
        assertEquals(0, BigDecimal.valueOf(2).compareTo(singleResult.path("maxPoints").decimalValue()));
        assertEquals(0, BigDecimal.valueOf(2).compareTo(singleResult.path("scoreEarned").decimalValue()));
        assertEquals(0, BigDecimal.ONE.compareTo(singleResult.path("weight").decimalValue()));
        assertEquals("AUTO", singleResult.path("gradingStatus").asText());
        assertTrue(singleResult.path("isCorrect").asBoolean());
        assertEquals("Java is compiled to bytecode.", singleResult.path("explanation").path("text").asText());
        assertEquals("MANAGER", singleResult.path("explanation").path("source").asText());
        boolean markedCorrect = false;
        for (JsonNode option : singleResult.path("options")) {
            if (option.path("optionId").asLong() == singleRight.getOptionId()) {
                markedCorrect = option.path("isCorrectAnswer").asBoolean();
            } else {
                assertFalse(option.path("isCorrectAnswer").asBoolean());
            }
        }
        assertTrue(markedCorrect);

        JsonNode essayResult = question(data, essay.getQuestionId());
        assertEquals("PENDING_AI", essayResult.path("gradingStatus").asText());
        assertTrue(essayResult.path("scoreEarned").isNull() || essayResult.path("scoreEarned").isMissingNode());
        assertEquals(0, essayResult.path("criteria").size());

        String raw = body(call(student, get(resultUrl(attemptId)))).toString();
        assertFalse(raw.contains("keySnapshot"));
        assertFalse(raw.contains("correctOptionIds"));
        assertFalse(raw.contains("rubric"));
        assertFalse(raw.contains("accepted"));
    }

    @Test
    void resultReturnsRubricPointsOnceTheAiGradedTheEssay() throws Exception {
        long attemptId = submittedAttempt(true);
        AttemptAnswer essayAnswer = answer(attemptId, essay.getQuestionId());
        essayAnswer.setGradingStatus("AI_GRADED");
        essayAnswer.setScoreEarned(new BigDecimal("3.20"));
        essayAnswer.setGradedAt(Instant.now());
        essayAnswer.setAiCriteriaScores("{\"criteria\":["
                + "{\"criterionId\":\"c1\",\"points\":2.00,\"feedback\":\"Solid\"},"
                + "{\"criterionId\":\"c2\",\"points\":1.20,\"feedback\":\"Good trade-off\"}]}");
        essayAnswer.setAiFeedbackJson("{\"overallFeedback\":\"Clear and correct\"}");
        em.flush();

        JsonNode essayResult = question(data(call(student, get(resultUrl(attemptId)))
                .andExpect(status().isOk())), essay.getQuestionId());
        assertEquals("AI_GRADED", essayResult.path("gradingStatus").asText());
        assertEquals(0, new BigDecimal("3.20").compareTo(essayResult.path("scoreEarned").decimalValue()));
        assertEquals("Clear and correct", essayResult.path("overallFeedback").asText());
        assertEquals(2, essayResult.path("criteria").size());
        JsonNode first = essayResult.path("criteria").get(0);
        assertEquals("c1", first.path("criterionId").asText());
        assertEquals("Memory management", first.path("name").asText());
        assertEquals(0, new BigDecimal("2.40").compareTo(first.path("maxPoints").decimalValue()));
        assertEquals(0, new BigDecimal("2.00").compareTo(first.path("points").decimalValue()));
        assertEquals("Solid", first.path("feedback").asText());
        JsonNode second = essayResult.path("criteria").get(1);
        assertEquals(0, new BigDecimal("1.60").compareTo(second.path("maxPoints").decimalValue()));
        assertEquals(0, new BigDecimal("1.20").compareTo(second.path("points").decimalValue()));
    }

    @Test
    void aFailedGradingKeepsItsErrorAndPendingPoints() throws Exception {
        long attemptId = submittedAttempt(true);
        AttemptAnswer essayAnswer = answer(attemptId, essay.getQuestionId());
        essayAnswer.setGradingStatus("FAILED");
        essayAnswer.setGradingError("AI_TIMEOUT");
        em.flush();

        JsonNode data = data(call(student, get(resultUrl(attemptId))).andExpect(status().isOk()));
        assertEquals(0, new BigDecimal("4.00").compareTo(data.path("pendingPoints").decimalValue()));
        JsonNode essayResult = question(data, essay.getQuestionId());
        assertEquals("FAILED", essayResult.path("gradingStatus").asText());
        assertEquals("AI_TIMEOUT", essayResult.path("gradingError").asText());
        assertEquals(0, essayResult.path("criteria").size());
        assertTrue(essayResult.path("overallFeedback").isNull()
                || essayResult.path("overallFeedback").isMissingNode());
    }

    @Test
    void resultIsForbiddenForAnotherStudent() throws Exception {
        long attemptId = submittedAttempt(false);
        call(otherStudent, get(resultUrl(attemptId))).andExpect(status().isForbidden());
    }

    // =================================================================================
    // SA-06
    // =================================================================================

    @Test
    void historyIsNewestFirstAndPagedInsideTheDatabase() throws Exception {
        long firstAttempt = submittedAttempt(false);
        long secondAttempt = submittedAttempt(true);

        JsonNode data = data(call(student, get(historyUrl(mainExam)).param("page", "0").param("size", "1"))
                .andExpect(status().isOk()));
        assertEquals(1, data.path("content").size());
        assertEquals(secondAttempt, data.path("content").get(0).path("attemptId").asLong());
        assertEquals(2, data.path("totalElements").asInt());
        assertEquals(2, data.path("totalPages").asInt());
        assertTrue(data.path("first").asBoolean());
        assertFalse(data.path("last").asBoolean());

        JsonNode secondPage = data(call(student, get(historyUrl(mainExam)).param("page", "1").param("size", "1"))
                .andExpect(status().isOk()));
        assertEquals(firstAttempt, secondPage.path("content").get(0).path("attemptId").asLong());
        assertTrue(secondPage.path("last").asBoolean());
    }

    @Test
    void historyCarriesScoresAndPendingPointsButNoAnswers() throws Exception {
        long attemptId = submittedAttempt(true);
        JsonNode data = data(call(student, get(historyUrl(mainExam))).andExpect(status().isOk()));
        assertEquals(1, data.path("content").size());
        JsonNode item = data.path("content").get(0);
        assertEquals(attemptId, item.path("attemptId").asLong());
        assertEquals("SUBMITTED", item.path("status").asText());
        assertEquals(0, new BigDecimal("6.00").compareTo(item.path("totalScore").decimalValue()));
        assertEquals(0, new BigDecimal("4.00").compareTo(item.path("pendingPoints").decimalValue()));
        assertEquals(0, new BigDecimal("10.00").compareTo(item.path("maxScore").decimalValue()));
        assertNotNull(item.path("startTime").textValue());
        assertNotNull(item.path("submittedAt").textValue());
        assertFalse(item.path("autoSubmitted").asBoolean());
        assertFalse(item.has("questions"));
        assertFalse(item.has("answers"));
        assertFalse(item.has("response"));
    }

    @Test
    void historyRequiresEnrollmentAndAnExistingExam() throws Exception {
        User outsider = account("STUDENT");
        call(outsider, get(historyUrl(mainExam))).andExpect(status().isForbidden());
        call(student, get("/api/v1/student/exams/999999/attempts")).andExpect(status().isNotFound());
    }

    @Test
    void historyValidatesPagingParameters() throws Exception {
        call(student, get(historyUrl(mainExam)).param("page", "-1")).andExpect(status().isBadRequest());
        call(student, get(historyUrl(mainExam)).param("size", "0")).andExpect(status().isBadRequest());
        call(student, get(historyUrl(mainExam)).param("size", "101")).andExpect(status().isBadRequest());
    }

    @Test
    void anEmptyHistoryPageStillReturnsAnEnvelope() throws Exception {
        JsonNode data = data(call(student, get(historyUrl(mainExam))).andExpect(status().isOk()));
        assertEquals(0, data.path("content").size());
        assertEquals(0, data.path("totalElements").asInt());
        assertTrue(data.path("first").asBoolean());
        assertTrue(data.path("last").asBoolean());
    }

    // =================================================================================
    // SA-07
    // =================================================================================

    @Test
    void cancelDiscardsTheAttemptAndKeepsNothingOfItInTheDatabase() throws Exception {
        String key = UUID.randomUUID().toString();
        long attemptId = data(call(student, post(startUrl(mainExam)).header("Idempotency-Key", key))
                .andExpect(status().isCreated())).path("attemptId").asLong();
        save(attemptId, draft(single.getQuestionId(), 1, selected(singleRight.getOptionId())))
                .andExpect(status().isOk());

        JsonNode data = data(call(student, delete(attemptUrl(attemptId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.message").value("Attempt cancelled")));
        assertEquals(attemptId, data.path("attemptId").asLong());
        assertEquals(mainExam.getExamId(), data.path("examId").asLong());

        assertEquals(0, attempts().size(), "the attempt row must not stay in the database");
        assertEquals(0, answers(attemptId).size(), "the frozen paper and the drafts must be gone");
        assertEquals(0, count(AttemptStartKey.class), "the idempotency key must be gone too");
        assertEquals(0, data(call(student, get(historyUrl(mainExam))).andExpect(status().isOk()))
                .path("totalElements").asInt(), "a cancelled attempt is not part of the history");

        // Nothing is left, so the very same student can simply start the exam again.
        long fresh = data(call(student, post(startUrl(mainExam))).andExpect(status().isCreated()))
                .path("attemptId").asLong();
        assertTrue(fresh != attemptId, "cancelling must not burn the single active attempt slot");
        assertEquals("IN_PROGRESS", attempt(fresh).getStatus());
    }

    @Test
    void cancelNeedsAStudentTokenAndOnlyWorksForTheOwner() throws Exception {
        long attemptId = data(call(student, post(startUrl(mainExam))).andExpect(status().isCreated()))
                .path("attemptId").asLong();

        mvc.perform(delete(attemptUrl(attemptId))).andExpect(status().isUnauthorized());
        call(manager, delete(attemptUrl(attemptId))).andExpect(status().isForbidden());
        call(otherStudent, delete(attemptUrl(attemptId))).andExpect(status().isForbidden());
        call(student, delete("/api/v1/student/attempts/999999")).andExpect(status().isNotFound());
        assertEquals(1, attempts().size(), "a refused cancel must change nothing");
    }

    @Test
    void cancelRefusesAnAttemptThatWasAlreadySubmitted() throws Exception {
        long attemptId = submittedAttempt(false);

        call(student, delete(attemptUrl(attemptId)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value("Attempt has already been submitted"));
        assertEquals(1, attempts().size());
        assertEquals(3, answers(attemptId).size());
        assertEquals("COMPLETED", attempt(attemptId).getStatus());
    }

    // =================================================================================
    // documentation
    // =================================================================================

    @Test
    void everyAttemptApiIsDocumented() throws Exception {
        JsonNode paths = json.readTree(mvc.perform(get("/v3/api-docs")).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString()).path("paths");

        JsonNode examAttempts = paths.path("/api/v1/student/exams/{examId}/attempts");
        assertTrue(examAttempts.has("post"), "SA-01 is missing from the OpenAPI document");
        assertTrue(examAttempts.has("get"), "SA-06 is missing from the OpenAPI document");
        assertTrue(paths.path("/api/v1/student/attempts/{attemptId}").has("get"),
                "SA-02 is missing from the OpenAPI document");
        assertTrue(paths.path("/api/v1/student/attempts/{attemptId}/answers").has("put"),
                "SA-03 is missing from the OpenAPI document");
        assertTrue(paths.path("/api/v1/student/attempts/{attemptId}/submit").has("post"),
                "SA-04 is missing from the OpenAPI document");
        assertTrue(paths.path("/api/v1/student/attempts/{attemptId}/result").has("get"),
                "SA-05 is missing from the OpenAPI document");
        assertTrue(paths.path("/api/v1/student/attempts/{attemptId}").has("delete"),
                "SA-07 is missing from the OpenAPI document");
    }

    // =================================================================================
    // helpers
    // =================================================================================

    private long submittedAttempt(boolean essayAnswered) throws Exception {
        long attemptId = data(call(student, post(startUrl(mainExam))).andExpect(status().isCreated()))
                .path("attemptId").asLong();
        List<Map<String, Object>> drafts = new ArrayList<>();
        drafts.add(draft(single.getQuestionId(), 1, selected(singleRight.getOptionId())));
        drafts.add(draft(multiple.getQuestionId(), 1,
                selected(multipleA.getOptionId(), multipleB.getOptionId())));
        if (essayAnswered) {
            drafts.add(draft(essay.getQuestionId(), 1, Map.of("text", "Generations, not objects.")));
        }
        call(student, post(submitUrl(attemptId)).contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("answers", drafts)))).andExpect(status().isOk());
        return attemptId;
    }

    private ResultActions call(User actor, MockHttpServletRequestBuilder request) throws Exception {
        em.flush();
        return mvc.perform(request.with(user(UserPrincipal.create(actor))));
    }

    private ResultActions save(long attemptId, Map<String, Object> draft) throws Exception {
        return call(student, put(answersUrl(attemptId)).contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("answers", List.of(draft)))));
    }

    private JsonNode body(MvcResult result) throws Exception {
        return json.readTree(result.getResponse().getContentAsString());
    }

    private JsonNode body(ResultActions actions) throws Exception {
        return body(actions.andReturn());
    }

    private JsonNode data(MvcResult result) throws Exception {
        return body(result).path("data");
    }

    private JsonNode data(ResultActions actions) throws Exception {
        return data(actions.andReturn());
    }

    private JsonNode question(JsonNode sessionOrResult, Long questionId) {
        for (JsonNode question : sessionOrResult.path("questions")) {
            if (question.path("questionId").asLong() == questionId) {
                return question;
            }
        }
        throw new AssertionError("question " + questionId + " is not part of the response");
    }

    private JsonNode answerOf(JsonNode session, Long questionId) {
        for (JsonNode answer : session.path("answers")) {
            if (answer.path("questionId").asLong() == questionId) {
                return answer;
            }
        }
        throw new AssertionError("question " + questionId + " has no answer entry");
    }

    private Set<Long> questionIds(JsonNode session) {
        Set<Long> ids = new HashSet<>();
        for (JsonNode question : session.path("questions")) {
            ids.add(question.path("questionId").asLong());
        }
        return ids;
    }

    private List<Integer> orderIndexes(JsonNode session) {
        List<Integer> positions = new ArrayList<>();
        for (JsonNode question : session.path("questions")) {
            positions.add(question.path("orderIndex").asInt());
        }
        return positions;
    }

    private Map<String, Object> draft(Long questionId, int seq, Map<String, Object> response) {
        Map<String, Object> draft = new LinkedHashMap<>();
        draft.put("questionId", questionId);
        draft.put("seq", seq);
        draft.put("response", response);
        return draft;
    }

    private Map<String, Object> selected(Long... optionIds) {
        return Map.of("selectedOptionIds", List.of(optionIds));
    }

    private void assertNoAnswerLeak(String rawJson) {
        for (String forbidden : List.of("keySnapshot", "correctOptionIds", "correctOrder",
                "isCorrectAnswer", "rubric", "accepted", "isCorrect")) {
            assertFalse(rawJson.contains(forbidden), "the response leaks " + forbidden);
        }
    }

    private String startUrl(Exam exam) {
        return "/api/v1/student/exams/" + exam.getExamId() + "/attempts";
    }

    private String attemptUrl(long attemptId) {
        return "/api/v1/student/attempts/" + attemptId;
    }

    private String answersUrl(long attemptId) {
        return attemptUrl(attemptId) + "/answers";
    }

    private String submitUrl(long attemptId) {
        return attemptUrl(attemptId) + "/submit";
    }

    private String resultUrl(long attemptId) {
        return attemptUrl(attemptId) + "/result";
    }

    private String historyUrl(Exam exam) {
        return "/api/v1/student/exams/" + exam.getExamId() + "/attempts";
    }

    private User account(String role) {
        User user = User.builder().email(UUID.randomUUID() + "@example.com").fullName(role)
                .passwordHash("test").roleName(role).build();
        em.persist(user);
        return user;
    }

    private void enroll(User user, Course course) {
        em.persist(Enrollment.builder().course(course).user(user).enrolledAt(Instant.now())
                .status(Enrollment.STATUS_ACTIVE).build());
    }

    private Question question(String type, String content) {
        Question question = Question.builder().module(module).questionType(type).content(content)
                .status("ACTIVE").approvalStatus("APPROVED").build();
        em.persist(question);
        return question;
    }

    private AnswerOption option(Question question, String text, boolean correct, int order) {
        AnswerOption option = AnswerOption.builder().question(question).optionText(text)
                .isCorrect(correct).orderIndex(order).build();
        em.persist(option);
        return option;
    }

    private Exam exam(String title, String generationType) {
        return exam(title, generationType, MAX_SCORE);
    }

    private Exam exam(String title, String generationType, BigDecimal maxScore) {
        Exam exam = Exam.builder().course(course).module(module).createdBy(manager).title(title)
                .durationMinutes(DURATION_MINUTES).generationType(generationType).isPractice(false)
                .maxScore(maxScore).status("PUBLISHED").publishedAt(Instant.now()).build();
        em.persist(exam);
        return exam;
    }

    private ExamQuestion attach(Exam exam, Question question, String weight) {
        long order = em.createQuery("select count(eq) from ExamQuestion eq where eq.exam = :exam", Long.class)
                .setParameter("exam", exam).getSingleResult();
        ExamQuestion link = ExamQuestion.builder().exam(exam).question(question)
                .weight(new BigDecimal(weight)).orderIndex((int) order).build();
        em.persist(link);
        return link;
    }

    private List<ExamAttempt> attempts() {
        return em.createQuery("select a from ExamAttempt a", ExamAttempt.class).getResultList();
    }

    private ExamAttempt attempt(long attemptId) {
        ExamAttempt attempt = em.find(ExamAttempt.class, attemptId);
        assertNotNull(attempt, "attempt " + attemptId + " was not created");
        return attempt;
    }

    private List<AttemptAnswer> answers(long attemptId) {
        return em.createQuery("select aa from AttemptAnswer aa where aa.attempt.attemptId = :id "
                + "order by aa.attemptAnswerId", AttemptAnswer.class)
                .setParameter("id", attemptId).getResultList();
    }

    private AttemptAnswer answer(long attemptId, Long questionId) {
        return em.createQuery("select aa from AttemptAnswer aa where aa.attempt.attemptId = :id "
                        + "and aa.question.questionId = :questionId", AttemptAnswer.class)
                .setParameter("id", attemptId).setParameter("questionId", questionId)
                .getSingleResult();
    }

    private long count(Class<?> entity) {
        return em.createQuery("select count(e) from " + entity.getSimpleName() + " e", Long.class)
                .getSingleResult();
    }
}
