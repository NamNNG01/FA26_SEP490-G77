package com.examprep.controllers;

import com.examprep.controllers.student.Fixtures;
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
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.List;

import static com.examprep.controllers.student.Fixtures.as;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Regression for the CODE update/resolve validation gap (2026-11-12):
 * QuestionServiceImpl.applyUpdate built QuestionPayload without codeConfig/testCases,
 * causing both PUT /api/v1/manager/questions/{id} and POST /api/v1/manager/question-issues/{id}/resolve
 * (with changes) to fail validation on CODE questions.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class QuestionUpdateResolveCodeIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired EntityManager em;
    @Autowired ObjectMapper json;

    private Fixtures f;
    private User manager;
    private User student;
    private Course course;
    private Module module;

    @BeforeEach
    void setUp() {
        f = new Fixtures(em);
        manager = f.account(User.ROLE_COURSE_MANAGER);
        student = f.account(User.ROLE_STUDENT);
        course = f.course(manager);
        em.persist(CourseManager.builder().course(course).user(manager).build());
        module = f.module(course, "Code Module");
        f.enroll(student, course);
        em.flush();
    }

    @Test
    void resolveCodeQuestionWithContentChangeUpdatesContentAndKeepsConfigAndTestCases() throws Exception {
        Question q = persistCodeQuestion("ACTIVE", "Print the sum of two integers");
        em.flush();

        long issueId = data(send(post("/api/v1/student/question-issues"), student,
                "{\"questionId\":" + q.getQuestionId()
                        + ",\"issueType\":\"WRONG_CONTENT\",\"description\":\"Prompt has a typo in input range\"}"))
                .path("issueId").asLong();

        JsonNode resolved = data(send(post("/api/v1/manager/question-issues/" + issueId + "/resolve"), manager,
                "{\"resolutionType\":\"CONTENT_CORRECTED\",\"resolutionNote\":\"Clarified input constraints\","
                        + "\"expectedLockVersion\":" + q.getLockVersion() + ","
                        + "\"changes\":{\"content\":\"Print the sum of two 32-bit integers\"}}")
                .andExpect(status().isOk()));

        assertEquals("RESOLVED", resolved.path("issue").path("status").asText());
        assertEquals("Print the sum of two 32-bit integers", f.reload(q).getContent());

        CodeQuestionConfig cfg = em.find(CodeQuestionConfig.class, q.getQuestionId());
        assertNotNull(cfg);
        assertEquals("[\"JAVA\",\"PYTHON\"]", cfg.getAllowedLanguages());
        assertEquals("public class Main {}", cfg.getCodeTemplate());
        assertEquals(4000, cfg.getTimeLimitMs());
        assertEquals(131072, cfg.getMemoryLimitKb());

        List<CodeTestCase> cases = loadCases(q);
        assertEquals(2, cases.size());
        assertEquals("1 2", cases.get(0).getInputData());
        assertFalse(cases.get(0).getHidden());
        assertEquals("10 20", cases.get(1).getInputData());
        assertTrue(cases.get(1).getHidden());
    }

    @Test
    void updateCodeQuestionContentOnlySucceedsAndKeepsConfigAndTestCases() throws Exception {
        Question q = persistCodeQuestion("INACTIVE", "Initial code prompt");
        em.flush();

        JsonNode updated = data(send(put("/api/v1/manager/questions/" + q.getQuestionId()), manager,
                "{\"content\":\"Updated code prompt\"}")
                .andExpect(status().isOk()));

        assertEquals("Updated code prompt", updated.path("content").asText());
        assertEquals(List.of("JAVA", "PYTHON"),
                json.convertValue(updated.path("codeConfig").path("allowedLanguages"), List.class));
        assertEquals(2, updated.path("testCases").size());
        assertEquals("Updated code prompt", f.reload(q).getContent());
    }

    @Test
    void updateCodeQuestionWithNewConfigAndTestCasesPersistsNewValues() throws Exception {
        Question q = persistCodeQuestion("INACTIVE", "Initial code prompt");
        em.flush();

        String body = """
                {
                  "content": "Solve in Python",
                  "codeConfig": {
                    "allowedLanguages": ["PYTHON"],
                    "codeTemplate": "def solve():\\n    pass",
                    "timeLimitMs": 2000,
                    "memoryLimitKb": 65536
                  },
                  "testCases": [
                    { "inputData": "2 3", "expectedOutput": "5", "hidden": false, "orderIndex": 0 },
                    { "inputData": "7 8", "expectedOutput": "15", "hidden": true, "orderIndex": 1 },
                    { "inputData": "0 0", "expectedOutput": "0", "hidden": true, "orderIndex": 2 }
                  ]
                }
                """;

        JsonNode updated = data(send(put("/api/v1/manager/questions/" + q.getQuestionId()), manager, body)
                .andExpect(status().isOk()));

        assertEquals("Solve in Python", updated.path("content").asText());
        assertEquals(List.of("PYTHON"),
                json.convertValue(updated.path("codeConfig").path("allowedLanguages"), List.class));
        assertEquals("def solve():\n    pass", updated.path("codeConfig").path("codeTemplate").asText());
        assertEquals(2000, updated.path("codeConfig").path("timeLimitMs").asInt());
        assertEquals(65536, updated.path("codeConfig").path("memoryLimitKb").asInt());
        assertEquals(3, updated.path("testCases").size());

        em.flush();
        em.clear();
        CodeQuestionConfig persistedCfg = em.find(CodeQuestionConfig.class, q.getQuestionId());
        assertNotNull(persistedCfg);
        assertEquals("[\"PYTHON\"]", persistedCfg.getAllowedLanguages());
        assertEquals(2000, persistedCfg.getTimeLimitMs());
        assertEquals(65536, persistedCfg.getMemoryLimitKb());

        List<CodeTestCase> persistedCases = loadCases(q);
        assertEquals(3, persistedCases.size());
        assertEquals("2 3", persistedCases.get(0).getInputData());
        assertEquals("0 0", persistedCases.get(2).getInputData());
    }

    @Test
    void updateCodeQuestionWithOnlyTestCasesPreservesExistingCodeConfig() throws Exception {
        Question q = persistCodeQuestion("INACTIVE", "Initial code prompt");
        em.flush();

        String body = """
                {
                  "testCases": [
                    { "inputData": "4 5", "expectedOutput": "9", "hidden": false, "orderIndex": 0 },
                    { "inputData": "11 22", "expectedOutput": "33", "hidden": true, "orderIndex": 1 }
                  ]
                }
                """;

        JsonNode updated = data(send(put("/api/v1/manager/questions/" + q.getQuestionId()), manager, body)
                .andExpect(status().isOk()));

        assertEquals(List.of("JAVA", "PYTHON"),
                json.convertValue(updated.path("codeConfig").path("allowedLanguages"), List.class));
        assertEquals("public class Main {}", updated.path("codeConfig").path("codeTemplate").asText());
        assertEquals(4000, updated.path("codeConfig").path("timeLimitMs").asInt());
        assertEquals(2, updated.path("testCases").size());
        assertEquals("4 5", updated.path("testCases").get(0).path("inputData").asText());
    }

    @Test
    void updateCodeQuestionWithOnlyCodeConfigPreservesExistingTestCases() throws Exception {
        Question q = persistCodeQuestion("INACTIVE", "Initial code prompt");
        em.flush();

        String body = """
                {
                  "codeConfig": {
                    "allowedLanguages": ["C", "CPP"],
                    "codeTemplate": "int main() { return 0; }",
                    "timeLimitMs": 1500,
                    "memoryLimitKb": 32768
                  }
                }
                """;

        JsonNode updated = data(send(put("/api/v1/manager/questions/" + q.getQuestionId()), manager, body)
                .andExpect(status().isOk()));

        assertEquals(List.of("C", "CPP"),
                json.convertValue(updated.path("codeConfig").path("allowedLanguages"), List.class));
        assertEquals(1500, updated.path("codeConfig").path("timeLimitMs").asInt());
        assertEquals(2, updated.path("testCases").size());
        assertEquals("1 2", updated.path("testCases").get(0).path("inputData").asText());
    }

    @Test
    void updateCodeQuestionWithoutHiddenTestCaseReturns400TestCasesError() throws Exception {
        Question q = persistCodeQuestion("INACTIVE", "Initial code prompt");
        em.flush();

        String body = """
                {
                  "testCases": [
                    { "inputData": "1 2", "expectedOutput": "3", "hidden": false, "orderIndex": 0 }
                  ]
                }
                """;

        send(put("/api/v1/manager/questions/" + q.getQuestionId()), manager, body)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.data[?(@.path=='testCases')]").exists());
    }

    private Question persistCodeQuestion(String status, String content) {
        Question q = Question.builder()
                .course(course)
                .module(module)
                .createdBy(manager)
                .questionType("CODE")
                .difficulty("MEDIUM")
                .content(content)
                .status(status)
                .approvalStatus("APPROVED")
                .scoringVersion(1)
                .lockVersion(0L)
                .build();
        em.persist(q);

        Instant now = Instant.now();
        em.persist(CodeQuestionConfig.builder()
                .questionId(q.getQuestionId())
                .allowedLanguages("[\"JAVA\",\"PYTHON\"]")
                .codeTemplate("public class Main {}")
                .timeLimitMs(4000)
                .memoryLimitKb(131072)
                .createdAt(now)
                .updatedAt(now)
                .build());

        em.persist(CodeTestCase.builder()
                .question(q).inputData("1 2").expectedOutput("3").hidden(false).orderIndex(0).createdAt(now).build());
        em.persist(CodeTestCase.builder()
                .question(q).inputData("10 20").expectedOutput("30").hidden(true).orderIndex(1).createdAt(now).build());
        return q;
    }

    private List<CodeTestCase> loadCases(Question q) {
        return em.createQuery(
                        "SELECT c FROM CodeTestCase c WHERE c.question = :q ORDER BY c.orderIndex ASC, c.testCaseId ASC",
                        CodeTestCase.class)
                .setParameter("q", q)
                .getResultList();
    }

    private ResultActions send(MockHttpServletRequestBuilder request, User actor, String content) throws Exception {
        return mvc.perform(request.with(as(actor)).contentType(MediaType.APPLICATION_JSON).content(content));
    }

    private JsonNode data(ResultActions result) throws Exception {
        return json.readTree(result.andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8)).path("data");
    }
}
