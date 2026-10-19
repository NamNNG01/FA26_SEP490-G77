package com.examprep.controllers;

import com.examprep.entities.*;
import com.examprep.entities.Module;
import com.examprep.security.UserPrincipal;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.annotation.Transactional;

import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.concurrent.ExecutorService;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class ExamAiApiIntegrationTest {
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final HttpServer PROVIDER;
    private static final ExecutorService WORKERS = Executors.newCachedThreadPool();
    private static volatile String providerContent;
    private static volatile String receivedRequest;
    private static volatile int providerStatus;
    private static volatile long delay;
    private static volatile int calls;
    static {
        try {
            PROVIDER = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            PROVIDER.setExecutor(WORKERS);
            PROVIDER.createContext("/v1/chat/completions", exchange -> {
                calls++;
                receivedRequest = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
                String content = providerContent;
                int responseStatus = providerStatus;
                long sleep = delay;
                try {
                    if (sleep > 0) Thread.sleep(sleep);
                    byte[] bytes = JSON.writeValueAsBytes(Map.of("choices", List.of(Map.of("finish_reason", "stop",
                            "message", Map.of("content", content)))));
                    exchange.getResponseHeaders().set("Content-Type", "application/json");
                    exchange.sendResponseHeaders(responseStatus, bytes.length);
                    exchange.getResponseBody().write(bytes);
                } catch (InterruptedException ex) {
                    Thread.currentThread().interrupt();
                } catch (java.io.IOException ex) {
                    // The client closes timed-out fake-provider connections.
                    if (sleep == 0) throw ex;
                } finally { exchange.close(); }
            });
            PROVIDER.start();
        } catch (java.io.IOException ex) { throw new ExceptionInInitializerError(ex); }
    }

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        registry.add("app.exam-ai.api-key", () -> "local-fake-provider-key");
        registry.add("app.exam-ai.model", () -> "fake-model");
        registry.add("app.exam-ai.base-url", () -> "http://127.0.0.1:" + PROVIDER.getAddress().getPort() + "/v1");
        registry.add("app.exam-ai.timeout-ms", () -> 250);
        registry.add("app.exam-ai.material-timeout-ms", () -> 350);
        registry.add("app.exam-ai.daily-limit", () -> 3);
    }

    @AfterAll static void stopProvider() { PROVIDER.stop(0); WORKERS.shutdownNow(); }

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired EntityManager em;
    User manager, assigned, foreign, admin, student;
    Course course;
    Module module;

    @BeforeEach void fixtures() throws Exception {
        manager = account(User.ROLE_COURSE_MANAGER);
        assigned = account(User.ROLE_COURSE_MANAGER);
        foreign = account(User.ROLE_COURSE_MANAGER);
        admin = account(User.ROLE_ADMIN);
        student = account(User.ROLE_STUDENT);
        Category category = Category.builder().name("AI test").slug(UUID.randomUUID().toString()).build();
        em.persist(category);
        course = Course.builder().categoryId(category.getCategoryId()).category(category).manager(manager)
                .title("Algebra").slug(UUID.randomUUID().toString()).isPublished(false).build();
        em.persist(course);
        module = Module.builder().course(course).title("Arithmetic").orderIndex(1).build();
        em.persist(module);
        em.persist(CourseManager.builder().course(course).user(assigned).build());
        providerStatus = 200; delay = 0; calls = 0; receivedRequest = null;
        providerContent = json.writeValueAsString(Map.of("title", "Draft", "questions", List.of(choice("SINGLE_CHOICE", "EASY"))));
        em.flush();
    }

    @Test void authorizationAndCourseModuleOwnershipAreEnforced() throws Exception {
        mvc.perform(post(path()).contentType(MediaType.APPLICATION_JSON).content(body())).andExpect(status().isUnauthorized());
        generate(student, body()).andExpect(status().isForbidden());
        generate(foreign, body()).andExpect(status().isForbidden());
        generate(manager, body().replace("\"courseId\":" + course.getCourseId(), "\"courseId\":9223372036854775807"))
                .andExpect(status().isNotFound());
        generate(manager, body().replace("\"moduleId\":" + module.getModuleId(), "\"moduleId\":9223372036854775807"))
                .andExpect(status().isNotFound());
        generate(assigned, body()).andExpect(status().isOk());
        generate(admin, body()).andExpect(status().isOk());
    }

    @Test void generatesPreviewWithCorrectProviderContractAndNoDatabaseWrites() throws Exception {
        long before = countQuestions();
        generate(manager, body()).andExpect(status().isOk()).andExpect(jsonPath("$.data.title").value("Draft"))
                .andExpect(jsonPath("$.data.questionCount").value(1))
                .andExpect(jsonPath("$.data.questions[0].options[0].isCorrect").value(true));
        assertEquals(before, countQuestions());
        assertEquals(0L, em.createQuery("select count(e) from Exam e where e.course = :course", Long.class)
                .setParameter("course", course).getSingleResult());
        JsonNode request = json.readTree(receivedRequest);
        assertEquals("fake-model", request.path("model").asText());
        assertEquals("json_object", request.path("response_format").path("type").asText());
        assertTrue(receivedRequest.contains("Arithmetic"));
        assertTrue(receivedRequest.contains("Algebra"));
    }

    @Test void rejectsInvalidCountsDistributionsTypesAndLanguageBeforeProviderCall() throws Exception {
        for (String invalid : List.of(body().replace("\"questionCount\":1", "\"questionCount\":51"),
                body().replace("\"EASY\":1", "\"EASY\":-1"), body().replace("\"EASY\":1", "\"EASY\":0"),
                body().replace("SINGLE_CHOICE", "UNKNOWN"), body().replace("\"count\":1", "\"count\":0"),
                body().replace("\"language\":\"en\"", "\"language\":\"xx\""))) {
            generate(manager, invalid).andExpect(status().isBadRequest());
        }
        assertEquals(0, calls);
    }

    @Test void bankPreferenceReusesValidOwnedQuestionsWithoutCallingProvider() throws Exception {
        Question question = Question.builder().module(module).content("Bank question").questionType("SINGLE_CHOICE")
                .difficulty("EASY").build();
        em.persist(question);
        em.persist(AnswerOption.builder().question(question).optionText("Yes").isCorrect(true).orderIndex(0).build());
        em.persist(AnswerOption.builder().question(question).optionText("No").isCorrect(false).orderIndex(1).build());
        em.flush();
        generate(assigned, body().replace("\"useExistingBank\":false", "\"useExistingBank\":true"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.questions[0].content").value("Bank question"));
        assertEquals(0, calls);
    }

    @Test void invalidAnswersAndWrongDistributionAreRemovedWithWarnings() throws Exception {
        Map<String, Object> wrong = choice("SINGLE_CHOICE", "HARD");
        Map<String, Object> invalid = Map.of("content", "Invalid answer", "questionType", "SINGLE_CHOICE", "difficulty", "EASY",
                "options", List.of(Map.of("optionText", "A", "isCorrect", true), Map.of("optionText", "B", "isCorrect", true)));
        providerContent = json.writeValueAsString(Map.of("questions", List.of(invalid, wrong, choice("SINGLE_CHOICE", "EASY"))));
        generate(manager, body()).andExpect(status().isOk()).andExpect(jsonPath("$.data.questionCount").value(1))
                .andExpect(jsonPath("$.data.warnings").isNotEmpty());
    }

    @Test void supportsAllNineTypesAndValidatesTheirAnswerShapes() throws Exception {
        List<Map<String, Object>> questions = List.of(choice("SINGLE_CHOICE", "EASY"),
                Map.of("content", "Pick the even numbers", "questionType", "MULTIPLE_CHOICE", "difficulty", "EASY", "options", List.of(
                        Map.of("optionText", "2", "isCorrect", true, "orderIndex", 0), Map.of("optionText", "4", "isCorrect", true, "orderIndex", 1),
                        Map.of("optionText", "3", "isCorrect", false, "orderIndex", 2))),
                Map.of("content", "True?", "questionType", "TRUE_FALSE", "difficulty", "EASY", "options", List.of(
                        Map.of("optionText", "True", "isCorrect", true, "orderIndex", 0), Map.of("optionText", "False", "isCorrect", false, "orderIndex", 1))),
                Map.of("content", "Fill ___", "questionType", "FILL_BLANK", "difficulty", "EASY", "options", List.of(Map.of("optionText", "answer", "isCorrect", true, "orderIndex", 0))),
                Map.of("content", "Match", "questionType", "MATCHING", "difficulty", "EASY", "options", List.of(
                        Map.of("optionText", "a", "correctMatch", "b", "orderIndex", 0), Map.of("optionText", "b", "correctMatch", "a", "orderIndex", 1))),
                Map.of("content", "Order", "questionType", "ORDERING", "difficulty", "EASY", "options", List.of(
                        Map.of("optionText", "a", "orderIndex", 0), Map.of("optionText", "b", "orderIndex", 1))),
                Map.of("content", "Explain", "questionType", "ESSAY", "difficulty", "EASY"),
                Map.of("content", "Code", "questionType", "CODE", "difficulty", "EASY", "questionMetadata", Map.of("language", "java", "testCases", List.of(Map.of("input", "1", "expectedOutput", "1")))),
                Map.of("content", "Diagram", "questionType", "DIAGRAM", "difficulty", "EASY", "questionMetadata", Map.of("diagramType", "CLASS", "plantUmlSource", "@startuml\nclass A\n@enduml")));
        providerContent = json.writeValueAsString(Map.of("questions", questions));
        String request = json.writeValueAsString(Map.of("courseId", course.getCourseId(), "questionCount", 9,
                "difficultyDistribution", Map.of("EASY", 9, "MEDIUM", 0, "HARD", 0),
                "questionTypes", questions.stream().map(q -> Map.of("questionType", q.get("questionType"), "count", 1)).toList()));
        generate(manager, request).andExpect(status().isOk()).andExpect(jsonPath("$.data.questionCount").value(9));
    }

    @Test void mapsProviderErrorsAndTimeoutToDistinctStatuses() throws Exception {
        providerStatus = 429;
        generate(manager, body()).andExpect(status().isTooManyRequests());
        providerStatus = 503;
        generate(manager, body()).andExpect(status().isBadGateway());
        providerStatus = 200; delay = 1000;
        generate(manager, body()).andExpect(status().isGatewayTimeout());
    }

    @Test void invalidProviderJsonReturnsMeaningfulUpstreamError() throws Exception {
        providerContent = "not JSON";
        generate(manager, body()).andExpect(status().isBadGateway()).andExpect(jsonPath("$.success").value(false));
    }

    @Test void rejectsInvalidMetadataMatchingOrderingAndTrueFalseAnswers() throws Exception {
        List<Map<String, Object>> invalid = List.of(
                Map.of("content", "TF", "questionType", "TRUE_FALSE", "difficulty", "EASY", "options", List.of(
                        Map.of("optionText", "Yes", "isCorrect", true, "orderIndex", 0), Map.of("optionText", "No", "isCorrect", false, "orderIndex", 1))),
                Map.of("content", "Match", "questionType", "MATCHING", "difficulty", "EASY", "options", List.of(
                        Map.of("optionText", "a", "orderIndex", 0), Map.of("optionText", "b", "orderIndex", 1))),
                Map.of("content", "Order", "questionType", "ORDERING", "difficulty", "EASY", "options", List.of(
                        Map.of("optionText", "a", "orderIndex", 0), Map.of("optionText", "b", "orderIndex", 0))),
                Map.of("content", "Code", "questionType", "CODE", "difficulty", "EASY", "questionMetadata", Map.of("language", "java")),
                Map.of("content", "Diagram", "questionType", "DIAGRAM", "difficulty", "EASY", "questionMetadata", Map.of("diagramType", "CLASS")));
        providerContent = json.writeValueAsString(Map.of("questions", invalid));
        String request = json.writeValueAsString(Map.of("courseId", course.getCourseId(), "questionCount", 5,
                "difficultyDistribution", Map.of("EASY", 5, "MEDIUM", 0, "HARD", 0),
                "questionTypes", invalid.stream().map(q -> Map.of("questionType", q.get("questionType"), "count", 1)).toList()));
        generate(manager, request).andExpect(status().isOk()).andExpect(jsonPath("$.data.questionCount").value(0))
                .andExpect(jsonPath("$.data.warnings").isNotEmpty());
    }

    @Test void dailyQuotaStopsAdditionalPaidCalls() throws Exception {
        for (int i = 0; i < 3; i++) generate(manager, body()).andExpect(status().isOk());
        generate(manager, body()).andExpect(status().isTooManyRequests());
        assertEquals(3, calls);
    }

    @Test void materialUsesSharedReaderReturnsExcerptsAndNeverWritesQuestions() throws Exception {
        long before = countQuestions();
        call(assigned, material("chapter.txt", "text/plain", "Arithmetic source material"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.fileName").value("chapter.txt"))
                .andExpect(jsonPath("$.data.sourceExcerpts").isNotEmpty());
        assertTrue(receivedRequest.contains("Arithmetic source material"));
        assertEquals(before, countQuestions());
    }

    @Test void rejectsUnsupportedAndOversizedMaterialBeforeProviderCall() throws Exception {
        call(manager, material("chapter.exe", "application/octet-stream", "invalid")).andExpect(status().isBadRequest());
        call(manager, multipart(path() + "-from-material").file(new MockMultipartFile("file", "big.txt", "text/plain", new byte[10 * 1024 * 1024 + 1]))
                .param("courseId", course.getCourseId().toString()).param("questionCount", "1")
                .param("difficultyDistribution", "{\"EASY\":1,\"MEDIUM\":0,\"HARD\":0}")
                .param("questionTypes", "[{\"questionType\":\"SINGLE_CHOICE\",\"count\":1}]"))
                .andExpect(status().isBadRequest());
        assertEquals(0, calls);
    }

    private MockHttpServletRequestBuilder material(String name, String type, String text) {
        return multipart(path() + "-from-material").file(new MockMultipartFile("file", name, type, text.getBytes(StandardCharsets.UTF_8)))
                .param("courseId", course.getCourseId().toString()).param("moduleId", module.getModuleId().toString())
                .param("questionCount", "1").param("difficultyDistribution", "{\"EASY\":1,\"MEDIUM\":0,\"HARD\":0}")
                .param("questionTypes", "[{\"questionType\":\"SINGLE_CHOICE\",\"count\":1}]");
    }
    private ResultActions generate(User actor, String body) throws Exception {
        return call(actor, post(path()).contentType(MediaType.APPLICATION_JSON).content(body));
    }
    private ResultActions call(User actor, MockHttpServletRequestBuilder request) throws Exception {
        em.flush(); return mvc.perform(request.with(user(UserPrincipal.create(actor))));
    }
    private String body() throws Exception { return json.writeValueAsString(Map.of("courseId", course.getCourseId(), "moduleId", module.getModuleId(),
            "questionCount", 1, "difficultyDistribution", Map.of("EASY", 1, "MEDIUM", 0, "HARD", 0),
            "questionTypes", List.of(Map.of("questionType", "SINGLE_CHOICE", "count", 1)), "language", "en", "useExistingBank", false)); }
    private static String path() { return "/api/v1/manager/exam-builder/ai/generate"; }
    private long countQuestions() { return em.createQuery("select count(q) from Question q", Long.class).getSingleResult(); }
    private Map<String, Object> choice(String type, String difficulty) {
        return Map.of("content", "What is 2 + 2?", "questionType", type, "difficulty", difficulty, "options", List.of(
                Map.of("optionText", "4", "isCorrect", true, "orderIndex", 0), Map.of("optionText", "3", "isCorrect", false, "orderIndex", 1)));
    }
    private User account(String role) {
        User value = User.builder().email(UUID.randomUUID() + "@example.com").fullName(role).passwordHash("test-hash").roleName(role).build();
        em.persist(value); return value;
    }
}
