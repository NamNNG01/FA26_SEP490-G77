package com.examprep.controllers;

import com.examprep.dto.ResponseCode;
import com.examprep.entities.*;
import com.examprep.exceptions.BaseException;
import com.examprep.security.UserPrincipal;
import com.examprep.services.AttemptAutoSubmitter;
import com.examprep.services.PistonClient;
import com.examprep.services.StudentAttemptService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * End-to-end contract tests of CD-03 … CD-07 (spec 19): listing code questions, running a sample,
 * submitting code, supported languages and submission history.
 *
 * <p>The sandbox client is mocked: the tests control every verdict (accepted, wrong output,
 * compile error, unavailable) while the service, the quota-free scoring of the running attempt
 * and the persisted submissions all run against H2. Hidden fixtures are asserted never to leave
 * the server.</p>
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
public class StudentCodeExamApiIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired EntityManager em;
    @Autowired StudentAttemptService attemptService;
    @Autowired AttemptAutoSubmitter autoSubmitter;
    @MockBean PistonClient piston;

    User manager, student, other, outsider;
    Category category;
    Course course;
    Exam exam;
    Question codeQuestion, sumQuestion, choiceQuestion;
    CodeQuestionConfig codeConfig;

    @BeforeEach
    void fixtures() {
        manager = account(User.ROLE_COURSE_MANAGER);
        student = account(User.ROLE_STUDENT);
        other = account(User.ROLE_STUDENT);
        outsider = account(User.ROLE_STUDENT);
        category = Category.builder().name("Code").slug(UUID.randomUUID().toString()).build();
        em.persist(category);
        course = Course.builder().categoryId(category.getCategoryId()).category(category).manager(manager)
                .title("Algorithms").slug(UUID.randomUUID().toString()).price(BigDecimal.ZERO).isPublished(true).build();
        em.persist(course);
        em.persist(Enrollment.builder().course(course).user(student).enrolledAt(Instant.now())
                .status(Enrollment.STATUS_ACTIVE).build());
        em.persist(Enrollment.builder().course(course).user(other).enrolledAt(Instant.now())
                .status(Enrollment.STATUS_ACTIVE).build());

        exam = Exam.builder().course(course).createdBy(manager).title("Code midterm").durationMinutes(60)
                .isPractice(false).generationType("STATIC").maxScore(new BigDecimal("10"))
                .status("PUBLISHED").publishedAt(Instant.now()).build();
        em.persist(exam);

        codeQuestion = codeQuestion("Reverse the string");
        sumQuestion = codeQuestion("Add two numbers");
        choiceQuestion = Question.builder().course(course).createdBy(manager).questionType("SINGLE_CHOICE")
                .difficulty("EASY").content("Pick one").status("ACTIVE").approvalStatus("APPROVED").build();
        em.persist(choiceQuestion);
        for (int option = 1; option <= 2; option++) {
            em.persist(AnswerOption.builder().question(choiceQuestion).optionText("Choice " + option)
                    .isCorrect(option == 1).orderIndex(option).build());
        }
        link(codeQuestion, 1);
        link(sumQuestion, 2);
        link(choiceQuestion, 3);

        fixture(codeQuestion, "abc", "cba", false, 1);
        fixture(codeQuestion, "xyz", "zyx", true, 2);
        fixture(codeQuestion, "hello", "olleh", true, 3);
        fixture(sumQuestion, "1 2", "3", false, 1);
        fixture(sumQuestion, "5 7", "12", true, 2);

        Instant now = Instant.now();
        codeConfig = CodeQuestionConfig.builder().questionId(codeQuestion.getQuestionId())
                .allowedLanguages("[\"JAVA\"]").codeTemplate("public class Main {}")
                .timeLimitMs(2_000).memoryLimitKb(131_072).createdAt(now).updatedAt(now).build();
        em.persist(codeConfig);
        em.persist(CodeQuestionConfig.builder().questionId(sumQuestion.getQuestionId()).allowedLanguages("[\"CPP\"]")
                .timeLimitMs(5_000).memoryLimitKb(262_144).createdAt(now).updatedAt(now).build());
        em.flush();
    }

    // =================================================================================
    // CD-03
    // =================================================================================

    @Test
    void questionsListCodeQuestionsWithoutHiddenFixturesOrAnswers() throws Exception {
        MvcResult result = call(student, get("/api/v1/student/code-exams/" + exam.getExamId() + "/questions"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.examId").value(exam.getExamId()))
                .andExpect(jsonPath("$.data.title").value("Code midterm"))
                .andExpect(jsonPath("$.data.durationMinutes").value(60))
                .andExpect(jsonPath("$.data.questions.length()").value(2)) // the choice question is not listed
                .andReturn();
        JsonNode data = data(result);

        JsonNode first = data.path("questions").get(0);
        assertEquals(codeQuestion.getQuestionId(), first.path("questionId").asLong());
        assertEquals(1, first.path("orderIndex").asInt());
        assertEquals("Reverse the string", first.path("content").asText());
        assertEquals("[\"JAVA\"]", first.path("languages").toString());
        assertEquals("public class Main {}", first.path("codeTemplate").asText());
        assertEquals("abc", first.path("sampleInput").asText());
        assertEquals("cba", first.path("sampleOutput").asText());

        JsonNode second = data.path("questions").get(1);
        assertEquals(sumQuestion.getQuestionId(), second.path("questionId").asLong());
        assertEquals(2, second.path("orderIndex").asInt());
        assertEquals("[\"CPP\"]", second.path("languages").toString());
        assertFalse(second.has("codeTemplate"));
        assertEquals("1 2", second.path("sampleInput").asText());
        assertEquals("3", second.path("sampleOutput").asText());

        String raw = result.getResponse().getContentAsString();
        assertFalse(raw.contains("zyx"), "hidden expected outputs must never leave the server");
        assertFalse(raw.contains("olleh"), "hidden expected outputs must never leave the server");
        assertFalse(raw.contains("5 7"), "hidden inputs must never leave the server");
        assertFalse(raw.contains("correctOptionIds"));

        call(outsider, get("/api/v1/student/code-exams/" + exam.getExamId() + "/questions"))
                .andExpect(status().isForbidden());
        call(other, get("/api/v1/student/code-exams/" + Long.MAX_VALUE + "/questions"))
                .andExpect(status().isNotFound());
        call(manager, get("/api/v1/student/code-exams/" + exam.getExamId() + "/questions"))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/student/code-exams/" + exam.getExamId() + "/questions"))
                .andExpect(status().isUnauthorized());

        sumQuestion.setDeletedAt(Instant.now());
        em.flush();
        call(student, get("/api/v1/student/code-exams/" + exam.getExamId() + "/questions"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.questions.length()").value(1));
    }

    @Test
    void codeApiOnlyServesPublishedExamsAndDeliverableQuestions() throws Exception {
        Exam draftExam = Exam.builder().course(course).createdBy(manager).title("Draft code exam")
                .durationMinutes(30).isPractice(false).generationType("STATIC")
                .maxScore(new BigDecimal("10")).status("DRAFT").build();
        em.persist(draftExam);
        em.flush();
        call(student, get("/api/v1/student/code-exams/" + draftExam.getExamId() + "/questions"))
                .andExpect(status().isNotFound());

        // A question withdrawn after the exam was published disappears from CD-03 and CD-04/CD-05.
        long attemptId = startAttempt();
        codeQuestion.setStatus("DRAFT");
        em.flush();
        call(student, get("/api/v1/student/code-exams/" + exam.getExamId() + "/questions"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.questions.length()").value(1));
        call(student, post("/api/v1/student/code-exams/run").contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("questionId", codeQuestion.getQuestionId(),
                        "language", "JAVA", "sourceCode", "class Main {}"))))
                .andExpect(status().isNotFound());

        call(student, post("/api/v1/student/code-exams/submit").contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("examId", exam.getExamId(),
                        "answers", List.of(Map.of("questionId", codeQuestion.getQuestionId(),
                                "language", "JAVA", "sourceCode", "PASS"))))))
                .andExpect(status().isNotFound());
        assertEquals(0, submissions().size());

        codeQuestion.setStatus("ACTIVE");
        codeQuestion.setApprovalStatus("PENDING");
        em.flush();
        call(student, get("/api/v1/student/code-exams/" + exam.getExamId() + "/questions"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.questions.length()").value(1));
        call(student, post("/api/v1/student/code-exams/run").contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("questionId", codeQuestion.getQuestionId(),
                        "language", "JAVA", "sourceCode", "class Main {}"))))
                .andExpect(status().isNotFound());
        verifyNoInteractions(piston);
        assertNull(answerOf(attemptId, codeQuestion.getQuestionId()).getScoreEarned());
    }

    @Test
    void archivedCodeQuestionRemainsUsableInAnExistingAttempt() throws Exception {
        startAttempt();
        codeQuestion.setStatus("ARCHIVED");
        exam.setStatus("ARCHIVED");
        em.flush();
        call(student, get("/api/v1/student/code-exams/" + exam.getExamId() + "/questions"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.questions.length()").value(2));
        stubJudge();
        call(student, post("/api/v1/student/code-exams/submit").contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("examId", exam.getExamId(), "answers", List.of(
                        Map.of("questionId", codeQuestion.getQuestionId(), "language", "JAVA", "sourceCode", "PASS"))))))
                .andExpect(status().isOk());
    }

    // =================================================================================
    // CD-04
    // =================================================================================

    @Test
    void runUsesThePublicSampleAndReturnsTheJudgeOutcome() throws Exception {
        codeConfig.setAllowedLanguages("[\"PYTHON\"]");
        startAttempt();
        when(piston.run(eq("PYTHON"), eq("print('cba')"), eq("abc"), eq(2_000), eq(131_072)))
                .thenReturn(new PistonClient.RunOutcome("COMPLETED", "cba\n", null, 120));
        when(piston.run(eq("CPP"), eq("int main(){}"), eq("custom-input"), eq(5_000), eq(262_144)))
                .thenReturn(new PistonClient.RunOutcome("FAILED", null, "error: ';' expected", null));

        call(student, post("/api/v1/student/code-exams/run").contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("questionId", codeQuestion.getQuestionId(),
                        "language", "PYTHON", "sourceCode", "print('cba')"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("COMPLETED"))
                .andExpect(jsonPath("$.data.stdout").value("cba\n"))
                .andExpect(jsonPath("$.data.stderr").doesNotExist())
                .andExpect(jsonPath("$.data.executionTimeMs").value(120));
        verify(piston).run("PYTHON", "print('cba')", "abc", 2_000, 131_072);

        call(student, post("/api/v1/student/code-exams/run").contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("questionId", sumQuestion.getQuestionId(),
                        "language", "CPP", "sourceCode", "int main(){}", "stdin", "custom-input"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("FAILED"))
                .andExpect(jsonPath("$.data.stderr").value("error: ';' expected"))
                .andExpect(jsonPath("$.data.stdout").doesNotExist());

        when(piston.run(anyString(), anyString(), anyString(), anyInt(), anyInt()))
                .thenThrow(new BaseException(ResponseCode.CODE_EXECUTION_UNAVAILABLE, "Piston is down"));
        call(student, post("/api/v1/student/code-exams/run").contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("questionId", codeQuestion.getQuestionId(),
                        "language", "PYTHON", "sourceCode", "class Main {}"))))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.message").value("Piston is down"));
    }

    @Test
    void runValidatesQuestionLanguageEnrollmentAndSourceSize() throws Exception {
        startAttempt();
        String url = "/api/v1/student/code-exams/run";
        call(student, post(url).contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("questionId", codeQuestion.getQuestionId(),
                        "language", "CPP", "sourceCode", "int main(){}"))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("This question does not allow the language CPP"));
        call(student, post(url).contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("questionId", codeQuestion.getQuestionId(),
                        "language", "RUBY", "sourceCode", "puts 1"))))
                .andExpect(status().isBadRequest());
        call(student, post(url).contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("questionId", choiceQuestion.getQuestionId(),
                        "language", "JAVA", "sourceCode", "class Main {}"))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Question is not a coding question"));
        call(student, post(url).contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("questionId", Long.MAX_VALUE,
                        "language", "JAVA", "sourceCode", "class Main {}"))))
                .andExpect(status().isNotFound());
        call(outsider, post(url).contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("questionId", codeQuestion.getQuestionId(),
                        "language", "JAVA", "sourceCode", "class Main {}"))))
                .andExpect(status().isNotFound());
        call(student, post(url).contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("questionId", codeQuestion.getQuestionId(),
                        "language", "JAVA", "sourceCode", "x".repeat(100 * 1024 + 1)))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.data.code").value("SOURCE_TOO_LARGE"));
        verifyNoInteractions(piston);
    }

    // =================================================================================
    // CD-05
    // =================================================================================

    @Test
    void pythonDraftAndJudgedSubmissionKeepTheirLanguageOnReload() throws Exception {
        codeConfig.setAllowedLanguages("[\"PYTHON\"]");
        long attemptId = startAttempt();
        String attemptUrl = "/api/v1/student/attempts/" + attemptId;
        String source = "# PASS " + "x".repeat(50_000);
        draft(attemptId, source, "PYTHON", 1)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.saved.length()").value(1));
        JsonNode reloaded = data(call(student, get(attemptUrl)).andExpect(status().isOk()));
        assertEquals("PYTHON", reloaded.path("answers").findValues("language").get(0).asText());
        draft(attemptId, "do not overwrite", "JAVA", 2)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.rejected[0].reason").value("INVALID_RESPONSE"));
        assertEquals(source, json.readTree(answerOf(attemptId, codeQuestion.getQuestionId()).getResponse()).path("text").asText());

        stubJudge();
        submit(student, codeBody("PYTHON", source)).andExpect(status().isOk());
        assertEquals("PYTHON", json.readTree(answerOf(attemptId, codeQuestion.getQuestionId()).getResponse()).path("language").asText());
        assertEquals("PYTHON", submissions().get(0).getLanguage());
    }

    @Test
    void usesTheSameUtf8SourceLimitForRunSubmitAndDrafts() throws Exception {
        long attemptId = startAttempt();
        String ascii = "x".repeat(102_400);
        String oversized = "\u1ec7".repeat(40_010);
        when(piston.run(eq("JAVA"), eq(ascii), anyString(), anyInt(), anyInt()))
                .thenReturn(new PistonClient.RunOutcome("COMPLETED", "", null, 1));
        runCode(codeQuestion, "JAVA", ascii).andExpect(status().isOk());
        runCode(codeQuestion, "JAVA", oversized).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.data.code").value("SOURCE_TOO_LARGE"));
        submit(student, codeBody("JAVA", oversized)).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.data.code").value("SOURCE_TOO_LARGE"));
        draft(attemptId, oversized, "JAVA", 1).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.rejected[0].detail").value("Code is larger than 100 KB"));
        verify(piston).run("JAVA", ascii, "abc", 2_000, 131_072);
        verifyNoMoreInteractions(piston);
        stubJudge();
        submit(student, codeBody("JAVA", ascii)).andExpect(status().isOk());
    }

    @Test
    void runRequiresAnOwnedUnexpiredAttemptContainingTheQuestion() throws Exception {
        exam.setStatus("DRAFT");
        runCode(codeQuestion, "JAVA", "class Main {}").andExpect(status().isNotFound());
        exam.setStatus("PUBLISHED");
        runCode(codeQuestion, "JAVA", "class Main {}").andExpect(status().isNotFound());
        verifyNoInteractions(piston);
        long attemptId = startAttempt();
        when(piston.run(anyString(), anyString(), anyString(), anyInt(), anyInt()))
                .thenReturn(new PistonClient.RunOutcome("COMPLETED", "cba", null, 1));
        runCode(codeQuestion, "JAVA", "class Main {}").andExpect(status().isOk());
        em.find(ExamAttempt.class, attemptId).setDeadlineAt(Instant.now().minusSeconds(10));
        runCode(codeQuestion, "JAVA", "class Main {}").andExpect(status().isNotFound());
    }

    @Test
    void codeSubmitAcceptedBeforeTheDeadlinePersistsAfterTheGracePeriod() throws Exception {
        long attemptId = startAttempt();
        Instant deadline = Instant.now().minusSeconds(2);
        em.find(ExamAttempt.class, attemptId).setDeadlineAt(deadline);
        when(piston.judge(eq("JAVA"), eq("PASS"), anyList(), anyInt(), anyInt())).thenAnswer(invocation -> {
            long wait = java.time.Duration.between(Instant.now(),
                    deadline.plusSeconds(AttemptAutoSubmitter.EXPIRY_GRACE_SECONDS).plusMillis(50)).toMillis();
            if (wait > 0) {
                Thread.sleep(wait);
            }
            List<PistonClient.CaseInput> cases = invocation.getArgument(2);
            return cases.stream().map(test -> new PistonClient.CaseOutcome(test.testCaseId(), true,
                    test.expectedOutput(), null, null, 1)).toList();
        });
        submit(student, codeBody("JAVA", "PASS")).andExpect(status().isOk());
        assertEquals(1, submissions().size());
        assertEquals("PASSED", submissions().get(0).getStatus());
    }

    @Test
    void scheduledExpiryGradesTheSavedCodeOnceForFullCredit() throws Exception {
        em.createQuery("DELETE FROM ExamQuestion e WHERE e.exam = :exam AND e.question <> :question")
                .setParameter("exam", exam).setParameter("question", codeQuestion).executeUpdate();
        exam.setDurationMinutes(1);
        long attemptId = startAttempt();
        draft(attemptId, "PASS", null, 1).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.saved.length()").value(1));
        em.find(ExamAttempt.class, attemptId).setDeadlineAt(Instant.now().minusSeconds(10));
        em.flush();
        stubJudge();

        autoSubmitter.closeExpiredCodeAttempts();
        autoSubmitter.closeExpiredCodeAttempts();

        call(student, get("/api/v1/student/attempts/" + attemptId + "/result"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("COMPLETED"))
                .andExpect(jsonPath("$.data.autoSubmitted").value(true))
                .andExpect(jsonPath("$.data.totalScore").value(10.0))
                .andExpect(jsonPath("$.data.questions[0].gradingStatus").value("AUTO"));
        verify(piston, times(1)).judge(eq("JAVA"), eq("PASS"), anyList(), anyInt(), anyInt());
        assertEquals(1, submissions().size());
    }

    @Test
    void manualSubmitGradesCodeAndRecordsProviderFailureAsFinal() throws Exception {
        long attemptId = startAttempt();
        when(piston.judge(anyString(), anyString(), anyList(), anyInt(), anyInt()))
                .thenThrow(new BaseException(ResponseCode.CODE_EXECUTION_UNAVAILABLE, "sandbox unavailable"));
        String url = "/api/v1/student/attempts/" + attemptId + "/submit";
        call(student, post(url).contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("answers", List.of(Map.of(
                        "questionId", codeQuestion.getQuestionId(), "seq", 1,
                        "response", Map.of("text", "PASS", "language", "JAVA")))))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.status").value("COMPLETED"));
        call(student, post(url)).andExpect(status().isOk());

        AttemptAnswer row = answerOf(attemptId, codeQuestion.getQuestionId());
        assertEquals("FAILED", row.getGradingStatus());
        assertEquals(0, row.getScoreEarned().signum());
        assertEquals("CODE_EXECUTION_UNAVAILABLE", row.getGradingError());
        assertEquals(1, submissions().size());
        assertEquals("FAILED", submissions().get(0).getStatus());
    }

    @Test
    void submitJudgesEveryFixtureAndScoresTheRunningAttempt() throws Exception {
        long attemptId = startAttempt();
        stubJudge();

        JsonNode data = data(submit(student, json.writeValueAsString(Map.of(
                "examId", exam.getExamId(),
                "answers", List.of(
                        Map.of("questionId", codeQuestion.getQuestionId(), "language", "JAVA", "sourceCode", "PASS"),
                        Map.of("questionId", sumQuestion.getQuestionId(), "language", "CPP", "sourceCode", "PARTIAL")))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.message").value("Submitted")));

        assertEquals(2, data.path("results").size());
        JsonNode passed = data.path("results").get(0);
        assertEquals(codeQuestion.getQuestionId(), passed.path("questionId").asLong());
        assertEquals("PASSED", passed.path("status").asText());
        assertEquals(3, passed.path("testCasesPassed").asInt());
        assertEquals(3, passed.path("testCasesTotal").asInt());
        assertFalse(passed.has("failedTestCase"));

        JsonNode partial = data.path("results").get(1);
        assertEquals("FAILED", partial.path("status").asText());
        assertEquals(1, partial.path("testCasesPassed").asInt());
        assertEquals(2, partial.path("testCasesTotal").asInt());
        assertEquals(2, partial.path("failedTestCase").asInt()); // 1-based index of the first failure

        // Both public and hidden fixtures reach the judge; limits come from the config.
        verify(piston).judge(eq("JAVA"), eq("PASS"), argThat(cases -> cases.size() == 3), eq(2_000), eq(131_072));
        verify(piston).judge(eq("CPP"), eq("PARTIAL"), argThat(cases -> cases.size() == 2), eq(5_000), eq(262_144));

        List<CodeSubmission> rows = submissions();
        assertEquals(2, rows.size());
        CodeSubmission passing = rows.get(0);
        assertEquals(CodeSubmission.PASSED, passing.getStatus());
        assertEquals(3, passing.getPassedCount());
        assertEquals(3, passing.getTotalCount());
        assertEquals("JAVA", passing.getLanguage());
        assertEquals("PASS", passing.getSourceCode());
        assertEquals("cba", passing.getStdout());
        assertEquals(12, passing.getTimeMs());
        assertNotNull(passing.getSubmittedAt());
        assertNotNull(passing.getJudgedAt());
        JsonNode testResults = json.readTree(passing.getTestResults());
        assertEquals(3, testResults.size());
        assertTrue(testResults.get(0).path("passed").asBoolean());
        assertEquals(student.getUserId(), passing.getUser().getUserId());
        assertEquals(attemptId, passing.getAttempt().getAttemptId());

        CodeSubmission failing = rows.get(1);
        assertEquals(CodeSubmission.FAILED, failing.getStatus());
        assertEquals(1, failing.getPassedCount());
        assertEquals(2, failing.getTotalCount());

        // P_q = 1/3 x 10 = 3.3333 → 3.33, all-or-nothing.
        AttemptAnswer passRow = answerOf(attemptId, codeQuestion.getQuestionId());
        assertEquals(0, new BigDecimal("3.33").compareTo(passRow.getScoreEarned()));
        assertTrue(passRow.getIsCorrect());
        assertEquals("AUTO", passRow.getGradingStatus());
        assertNotNull(passRow.getGradedAt());
        assertNull(passRow.getGradingError());
        assertEquals(json.readTree("{\"text\":\"PASS\",\"language\":\"JAVA\"}"), json.readTree(passRow.getResponse()));

        AttemptAnswer failedRow = answerOf(attemptId, sumQuestion.getQuestionId());
        assertEquals(0, BigDecimal.ZERO.compareTo(failedRow.getScoreEarned()));
        assertFalse(failedRow.getIsCorrect());
        assertEquals("AUTO", failedRow.getGradingStatus());

        // A second submit replaces the score of a question and keeps the attempt running.
        data(submit(student, json.writeValueAsString(Map.of(
                "examId", exam.getExamId(),
                "answers", List.of(Map.of("questionId", codeQuestion.getQuestionId(),
                        "language", "JAVA", "sourceCode", "FAIL")))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.results[0].status").value("FAILED"))
                .andExpect(jsonPath("$.data.results[0].failedTestCase").value(1)));
        assertEquals(3, submissions().size());
        assertEquals(0, BigDecimal.ZERO.compareTo(answerOf(attemptId, codeQuestion.getQuestionId()).getScoreEarned()));
        assertEquals("IN_PROGRESS", em.find(ExamAttempt.class, attemptId).getStatus());

        // SA-03 cannot detach the judged source from its all-or-nothing verdict.
        ResultActions draftSave = call(student, put("/api/v1/student/attempts/" + attemptId + "/answers")
                .contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("answers", List.of(Map.of(
                        "questionId", codeQuestion.getQuestionId(), "seq", 1,
                        "response", Map.of("text", "class Sneaky {}")))))));
        JsonNode draftSaved = data(draftSave.andExpect(status().isOk()));
        assertEquals("ALREADY_GRADED", draftSaved.path("rejected").get(0).path("reason").asText());
        assertEquals(json.readTree("{\"text\":\"FAIL\",\"language\":\"JAVA\"}"),
                json.readTree(answerOf(attemptId, codeQuestion.getQuestionId()).getResponse()));
        assertTrue(draftSaved.path("saved").isEmpty());
    }

    @Test
    void submitValidatesTheAttemptAnswersAndLanguageBeforeJudging() throws Exception {
        long attemptId = startAttempt();
        String url = "/api/v1/student/code-exams/submit";
        String valid = json.writeValueAsString(Map.of("examId", exam.getExamId(),
                "answers", List.of(Map.of("questionId", codeQuestion.getQuestionId(),
                        "language", "JAVA", "sourceCode", "PASS"))));

        call(student, post(url).contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(
                Map.of("examId", exam.getExamId(), "answers", List.of()))))
                .andExpect(status().isBadRequest());
        call(student, post(url).contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(
                Map.of("examId", exam.getExamId(),
                        "answers", List.of(
                                Map.of("questionId", codeQuestion.getQuestionId(), "language", "JAVA", "sourceCode", "a"),
                                Map.of("questionId", codeQuestion.getQuestionId(), "language", "CPP", "sourceCode", "b"))))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Duplicate questionId in answers"));

        Question outside = codeQuestion("Not part of the exam");
        fixture(outside, "a", "b", false, 1);
        em.flush();
        call(student, post(url).contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(
                Map.of("examId", exam.getExamId(),
                        "answers", List.of(Map.of("questionId", outside.getQuestionId(),
                                "language", "JAVA", "sourceCode", "PASS"))))))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.message").value("Question is not part of this exam"));

        call(student, post(url).contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(
                Map.of("examId", exam.getExamId(),
                        "answers", List.of(Map.of("questionId", choiceQuestion.getQuestionId(),
                                "language", "JAVA", "sourceCode", "PASS"))))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Question is not a coding question"));

        call(student, post(url).contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(
                Map.of("examId", exam.getExamId(),
                        "answers", List.of(Map.of("questionId", codeQuestion.getQuestionId(),
                                "language", "CPP", "sourceCode", "PASS"))))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("This question does not allow the language CPP"));

        // Linked question without fixtures, then a linked question the attempt has no row for.
        Question noFixtures = codeQuestion("No fixtures");
        link(noFixtures, 4);
        em.flush();
        call(student, post(url).contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(
                Map.of("examId", exam.getExamId(),
                        "answers", List.of(Map.of("questionId", noFixtures.getQuestionId(),
                                "language", "JAVA", "sourceCode", "PASS"))))))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value("Question has no test cases configured"));

        Question lateQuestion = codeQuestion("Added after the attempt started");
        fixture(lateQuestion, "a", "a", false, 1);
        link(lateQuestion, 5);
        em.flush();
        call(student, post(url).contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(
                Map.of("examId", exam.getExamId(),
                        "answers", List.of(Map.of("questionId", lateQuestion.getQuestionId(),
                                "language", "JAVA", "sourceCode", "PASS"))))))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value("The attempt has no answer row for this question"));

        verifyNoInteractions(piston);
        assertEquals(0, submissions().size());
        assertNull(answerOf(attemptId, codeQuestion.getQuestionId()).getScoreEarned());

        call(outsider, post(url).contentType(MediaType.APPLICATION_JSON).content(valid))
                .andExpect(status().isForbidden());
        call(student, post(url).contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(
                Map.of("examId", Long.MAX_VALUE, "answers", List.of(Map.of("questionId",
                        codeQuestion.getQuestionId(), "language", "JAVA", "sourceCode", "PASS"))))))
                .andExpect(status().isNotFound());
    }

    @Test
    void aPaperWithEveryAnswerCorrectTotalsExactlyTheMaximum() throws Exception {
        long attemptId = startAttempt();
        stubJudge();

        // CD-05 stores each code answer with its 2-digit P_q (1/3 x 10 → 3.33).
        submit(student, json.writeValueAsString(Map.of(
                "examId", exam.getExamId(),
                "answers", List.of(
                        Map.of("questionId", codeQuestion.getQuestionId(), "language", "JAVA", "sourceCode", "PASS"),
                        Map.of("questionId", sumQuestion.getQuestionId(), "language", "CPP", "sourceCode", "PASS")))))
                .andExpect(status().isOk());

        // The last (choice) answer rides on the submit; adding the stored 2-digit scores would end
        // the fully correct paper at 9.99. It must total exactly the frozen max score (10.00).
        AnswerOption correct = em.createQuery("select o from AnswerOption o where o.question.questionId = :id "
                        + "and o.isCorrect = true", AnswerOption.class)
                .setParameter("id", choiceQuestion.getQuestionId()).getSingleResult();
        call(student, post("/api/v1/student/attempts/" + attemptId + "/submit")
                .contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("answers", List.of(Map.of(
                        "questionId", choiceQuestion.getQuestionId(), "seq", 1,
                        "response", Map.of("selectedOptionIds", List.of(correct.getOptionId()))))))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("COMPLETED"))
                .andExpect(jsonPath("$.data.maxScore").value(10))
                .andExpect(jsonPath("$.data.totalScore").value(10.00));

        assertEquals(0, new BigDecimal("10.00")
                .compareTo(em.find(ExamAttempt.class, attemptId).getTotalScore()));
    }

    @Test
    void submitRequiresARunningNonExpiredAttempt() throws Exception {
        String body = json.writeValueAsString(Map.of("examId", exam.getExamId(),
                "answers", List.of(Map.of("questionId", codeQuestion.getQuestionId(),
                        "language", "JAVA", "sourceCode", "PASS"))));
        call(student, post("/api/v1/student/code-exams/submit").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value("No attempt is in progress for this exam"));

        long attemptId = startAttempt();
        ExamAttempt attempt = em.find(ExamAttempt.class, attemptId);
        attempt.setDeadlineAt(Instant.now().minus(1, ChronoUnit.MINUTES));
        em.flush();
        call(student, post("/api/v1/student/code-exams/submit").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value("The attempt deadline has passed"));
        verifyNoInteractions(piston);
        assertEquals(0, submissions().size());
    }

    @Test
    void submitPropagatesJudgeUnavailabilityAndWritesNothing() throws Exception {
        long attemptId = startAttempt();
        when(piston.judge(anyString(), anyString(), anyList(), anyInt(), anyInt()))
                .thenThrow(new BaseException(ResponseCode.CODE_EXECUTION_UNAVAILABLE, "Piston is down"));

        call(student, post("/api/v1/student/code-exams/submit").contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("examId", exam.getExamId(),
                        "answers", List.of(Map.of("questionId", codeQuestion.getQuestionId(),
                                "language", "JAVA", "sourceCode", "PASS"))))))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.message").value("Piston is down"));
        assertEquals(0, submissions().size());
        AttemptAnswer row = answerOf(attemptId, codeQuestion.getQuestionId());
        assertNull(row.getScoreEarned());
        assertNull(row.getGradedAt());
    }

    // =================================================================================
    // CD-06
    // =================================================================================

    @Test
    void languagesListsTheSupportedLanguages() throws Exception {
        call(student, get("/api/v1/student/code-exams/languages"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(4))
                .andExpect(jsonPath("$.data[0].id").value("JAVA"))
                .andExpect(jsonPath("$.data[0].name").value("Java 25"))
                .andExpect(jsonPath("$.data[1].id").value("PYTHON"))
                .andExpect(jsonPath("$.data[2].id").value("C"))
                .andExpect(jsonPath("$.data[3].id").value("CPP"));
        call(outsider, get("/api/v1/student/code-exams/languages")).andExpect(status().isOk());
        call(manager, get("/api/v1/student/code-exams/languages")).andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/student/code-exams/languages")).andExpect(status().isUnauthorized());
    }

    // =================================================================================
    // CD-07
    // =================================================================================

    @Test
    void submissionsHistoryIsOwnerScopedNewestFirstAndPaged() throws Exception {
        long attemptId = startAttempt();
        stubJudge();
        submit(student, json.writeValueAsString(Map.of("examId", exam.getExamId(), "answers", List.of(
                Map.of("questionId", codeQuestion.getQuestionId(), "language", "JAVA", "sourceCode", "PASS"),
                Map.of("questionId", sumQuestion.getQuestionId(), "language", "CPP", "sourceCode", "PARTIAL")))))
                .andExpect(status().isOk());
        submit(student, json.writeValueAsString(Map.of("examId", exam.getExamId(), "answers", List.of(
                Map.of("questionId", codeQuestion.getQuestionId(), "language", "JAVA", "sourceCode", "FAIL")))))
                .andExpect(status().isOk());

        // Another student's submission on the same exam must never leak into this history.
        pendingSubmission(other, Instant.now().minus(5, ChronoUnit.MINUTES));

        JsonNode data = data(call(student, get("/api/v1/student/code-exams/" + exam.getExamId() + "/submissions"))
                .andExpect(status().isOk()));
        assertEquals(3, data.path("content").size());
        assertEquals(3L, data.path("totalElements").asLong());
        data.path("content").forEach(item -> assertEquals(attemptId, item.path("attemptId").asLong()));
        assertEquals(3, data.path("content").get(0).path("testCasesTotal").asInt());
        assertEquals("FAILED", data.path("content").get(0).path("status").asText());
        assertEquals(codeQuestion.getQuestionId(), data.path("content").get(0).path("questionId").asLong());
        assertEquals("JAVA", data.path("content").get(0).path("language").asText());
        assertEquals(0, data.path("content").get(0).path("testCasesPassed").asInt());
        assertNotNull(data.path("content").get(0).path("createdAt").textValue());
        assertEquals("FAILED", data.path("content").get(1).path("status").asText());
        assertEquals(sumQuestion.getQuestionId(), data.path("content").get(1).path("questionId").asLong());
        assertEquals("PASSED", data.path("content").get(2).path("status").asText());
        assertEquals(codeQuestion.getQuestionId(), data.path("content").get(2).path("questionId").asLong());

        // CD-07 lists a public fixture's input and the program's output; a failed fixture never
        // carries its expected output, and a hidden fixture carries none of its data at all — a
        // student must not be able to read hidden inputs from the history and resubmit around them.
        JsonNode firstCases = data.path("content").get(0).path("testCases");
        assertEquals(3, firstCases.size());
        assertFalse(firstCases.get(0).path("hidden").asBoolean());
        for (int i = 1; i < firstCases.size(); i++) {
            assertTrue(firstCases.get(i).path("hidden").asBoolean());
        }
        assertEquals("abc", firstCases.get(0).path("inputData").asText());
        assertFalse(firstCases.get(0).path("passed").asBoolean(true));
        assertEquals("wrong", firstCases.get(0).path("actualOutput").asText());
        assertFalse(firstCases.get(0).hasNonNull("expectedOutput"));
        for (int i = 1; i < firstCases.size(); i++) {
            JsonNode hiddenCase = firstCases.get(i);
            assertTrue(hiddenCase.hasNonNull("testCaseId"));
            assertTrue(hiddenCase.hasNonNull("orderIndex"));
            assertFalse(hiddenCase.path("passed").asBoolean(true));
            assertFalse(hiddenCase.hasNonNull("inputData"), "a hidden input must never leave the server");
            assertFalse(hiddenCase.hasNonNull("expectedOutput"));
            assertFalse(hiddenCase.hasNonNull("actualOutput"), "stdout can echo the hidden input back");
        }
        JsonNode passedCases = data.path("content").get(2).path("testCases");
        assertEquals(3, passedCases.size());
        for (JsonNode testCase : passedCases) {
            assertTrue(testCase.path("passed").asBoolean(false));
        }
        // The public case shows its input, what was expected and what the program printed; the
        // hidden ones stay colorless even after passing.
        assertEquals("abc", passedCases.get(0).path("inputData").asText());
        assertEquals("cba", passedCases.get(0).path("expectedOutput").asText());
        assertEquals("cba", passedCases.get(0).path("actualOutput").asText());
        for (int i = 1; i < passedCases.size(); i++) {
            assertFalse(passedCases.get(i).hasNonNull("inputData"));
            assertFalse(passedCases.get(i).hasNonNull("expectedOutput"));
            assertFalse(passedCases.get(i).hasNonNull("actualOutput"));
        }

        JsonNode page1 = data(call(student, get("/api/v1/student/code-exams/" + exam.getExamId()
                + "/submissions?page=1&size=2")).andExpect(status().isOk()));
        assertEquals(1, page1.path("content").size());
        assertEquals(1, page1.path("page").asInt());
        assertEquals(3L, page1.path("totalElements").asLong());
        assertEquals(2, page1.path("totalPages").asInt());
        assertTrue(page1.path("last").asBoolean());

        JsonNode otherHistory = data(call(other, get("/api/v1/student/code-exams/" + exam.getExamId() + "/submissions"))
                .andExpect(status().isOk()));
        assertEquals(1, otherHistory.path("content").size());
        assertEquals(other.getUserId(), submissions().stream()
                .filter(row -> row.getSubmissionId().equals(otherHistory.path("content").get(0).path("submissionId").asLong()))
                .findFirst().orElseThrow().getUser().getUserId());

        String historyUrl = "/api/v1/student/code-exams/" + exam.getExamId() + "/submissions";
        call(student, get(historyUrl).param("attemptId", Long.toString(attemptId)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.content.length()").value(3));
        call(other, get(historyUrl).param("attemptId", Long.toString(attemptId)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.content.length()").value(0));
        attemptService.submit(student.getUserId(), attemptId, null);
        long emptyAttemptId = startAttempt();
        call(student, get(historyUrl).param("attemptId", Long.toString(emptyAttemptId)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.content.length()").value(0));

        call(outsider, get("/api/v1/student/code-exams/" + exam.getExamId() + "/submissions"))
                .andExpect(status().isForbidden());
        call(student, get("/api/v1/student/code-exams/" + Long.MAX_VALUE + "/submissions"))
                .andExpect(status().isNotFound());
        call(student, get("/api/v1/student/code-exams/" + exam.getExamId() + "/submissions?page=-1"))
                .andExpect(status().isBadRequest());
        call(student, get("/api/v1/student/code-exams/" + exam.getExamId() + "/submissions?size=101"))
                .andExpect(status().isBadRequest());
    }

    // =================================================================================
    // helpers
    // =================================================================================

    private void stubJudge() {
        when(piston.judge(anyString(), anyString(), anyList(), anyInt(), anyInt())).thenAnswer(invocation -> {
            String source = invocation.getArgument(1);
            List<PistonClient.CaseInput> cases = invocation.getArgument(2);
            List<PistonClient.CaseOutcome> outcomes = new ArrayList<>();
            for (int i = 0; i < cases.size(); i++) {
                PistonClient.CaseInput testCase = cases.get(i);
                boolean pass = source.contains("PASS") || (source.contains("PARTIAL") && i == 0);
                outcomes.add(new PistonClient.CaseOutcome(testCase.testCaseId(), pass,
                        pass ? testCase.expectedOutput() : "wrong", null, null, 10 + i));
            }
            return outcomes;
        });
    }

    private long startAttempt() {
        em.flush();
        return attemptService.start(student.getUserId(), exam.getExamId(), null).attemptId();
    }

    private ResultActions call(User actor, MockHttpServletRequestBuilder request) throws Exception {
        em.flush();
        return mvc.perform(request.with(user(UserPrincipal.create(actor))));
    }

    private ResultActions submit(User actor, String body) throws Exception {
        return call(actor, post("/api/v1/student/code-exams/submit")
                .contentType(MediaType.APPLICATION_JSON).content(body));
    }

    private ResultActions runCode(Question question, String language, String source) throws Exception {
        return call(student, post("/api/v1/student/code-exams/run").contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("questionId", question.getQuestionId(),
                        "language", language, "sourceCode", source))));
    }

    private String codeBody(String language, String source) throws Exception {
        return json.writeValueAsString(Map.of("examId", exam.getExamId(), "answers", List.of(
                Map.of("questionId", codeQuestion.getQuestionId(), "language", language, "sourceCode", source))));
    }

    private ResultActions draft(long attemptId, String source, String language, int seq) throws Exception {
        var response = json.createObjectNode().put("text", source);
        if (language != null) {
            response.put("language", language);
        }
        return call(student, put("/api/v1/student/attempts/" + attemptId + "/answers")
                .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(Map.of("answers", List.of(
                        Map.of("questionId", codeQuestion.getQuestionId(), "seq", seq, "response", response))))));
    }

    private JsonNode data(MvcResult result) throws Exception {
        return json.readTree(result.getResponse().getContentAsString()).path("data");
    }

    private JsonNode data(ResultActions actions) throws Exception {
        return data(actions.andReturn());
    }

    private List<CodeSubmission> submissions() {
        em.flush();
        return em.createQuery("select s from CodeSubmission s order by s.submissionId", CodeSubmission.class)
                .getResultList();
    }

    private AttemptAnswer answerOf(long attemptId, long questionId) {
        return em.createQuery("select a from AttemptAnswer a where a.attempt.attemptId = :attempt "
                        + "and a.question.questionId = :question", AttemptAnswer.class)
                .setParameter("attempt", attemptId).setParameter("question", questionId).getSingleResult();
    }

    private User account(String role) {
        User user = User.builder().email(UUID.randomUUID() + "@example.com").fullName(role)
                .passwordHash("test").roleName(role).build();
        em.persist(user);
        return user;
    }

    private Question codeQuestion(String content) {
        Question question = Question.builder().course(course).createdBy(manager).questionType("CODE")
                .difficulty("MEDIUM").content(content).status("ACTIVE").approvalStatus("APPROVED").build();
        em.persist(question);
        return question;
    }

    private void link(Question question, int order) {
        em.persist(ExamQuestion.builder().exam(exam).question(question)
                .weight(BigDecimal.ONE).orderIndex(order).build());
    }

    private void fixture(Question question, String input, String expected, boolean hidden, int order) {
        em.persist(CodeTestCase.builder().question(question).inputData(input).expectedOutput(expected)
                .hidden(hidden).orderIndex(order).createdAt(Instant.now()).build());
    }

    private void pendingSubmission(User owner, Instant submittedAt) {
        ExamAttempt attempt = ExamAttempt.builder().exam(exam).user(owner).startTime(submittedAt)
                .deadlineAt(submittedAt.plus(60, ChronoUnit.MINUTES)).status("SUBMITTED")
                .examSnapshot("{\"maxScore\":10}").build();
        em.persist(attempt);
        AttemptAnswer answer = AttemptAnswer.builder().attempt(attempt).question(codeQuestion)
                .weightSnapshot(BigDecimal.ONE).displaySnapshot("{}").keySnapshot("{}").build();
        em.persist(answer);
        em.persist(CodeSubmission.builder().attemptAnswer(answer).attempt(attempt).question(codeQuestion)
                .user(owner).language("JAVA").sourceCode("class Main {}").status(CodeSubmission.PASSED)
                .passedCount(3).totalCount(3).submittedAt(submittedAt).judgedAt(submittedAt).build());
        em.flush();
    }
}
