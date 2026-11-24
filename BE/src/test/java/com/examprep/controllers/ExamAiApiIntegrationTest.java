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
    private static volatile String retryContent;
    private static volatile String receivedRequest;
    private static volatile String receivedPath;
    private static volatile int providerStatus;
    private static volatile long delay;
    private static volatile int calls;
    static {
        try {
            PROVIDER = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            PROVIDER.setExecutor(WORKERS);
            PROVIDER.createContext("/v1beta/models/", exchange -> {
                calls++;
                receivedPath = exchange.getRequestURI().getPath();
                receivedRequest = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
                String content = calls > 1 && retryContent != null ? retryContent : providerContent;
                int responseStatus = providerStatus;
                long sleep = delay;
                try {
                    if (sleep > 0) Thread.sleep(sleep);
                    byte[] bytes = JSON.writeValueAsBytes(Map.of("candidates", List.of(Map.of("content",
                            Map.of("parts", List.of(Map.of("text", content)))))));
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
        registry.add("app.ai.api-key", () -> "local-fake-provider-key");
        registry.add("app.ai.model", () -> "fake-model");
        registry.add("app.ai.base-url", () -> "http://127.0.0.1:" + PROVIDER.getAddress().getPort() + "/v1beta");
        registry.add("app.exam-ai.timeout-ms", () -> 600);
        registry.add("app.exam-ai.material-timeout-ms", () -> 600);
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
                .title("Algebra").description("Linear equations for first-year students").slug(UUID.randomUUID().toString()).isPublished(false).build();
        em.persist(course);
        module = Module.builder().course(course).title("Arithmetic").description("Fractions and percentages").orderIndex(1).build();
        em.persist(module);
        em.persist(CourseManager.builder().course(course).user(assigned).build());
        providerStatus = 200; delay = 0; calls = 0; receivedRequest = null; retryContent = null;
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
        assertEquals("/v1beta/models/fake-model:generateContent", receivedPath);
        assertTrue(request.path("systemInstruction").toString().contains("JSON object"));
        // Structured output keeps Gemini from returning malformed JSON.
        assertEquals("application/json", request.path("generationConfig").path("responseMimeType").asText());
        assertEquals("OBJECT", request.path("generationConfig").path("responseSchema")
                .path("properties").path("questions").path("items").path("properties").path("essayGradingRubric").path("type").asText());
        assertTrue(receivedRequest.contains("Arithmetic"));
        assertTrue(receivedRequest.contains("Algebra"));
        // DB context and the teacher's own instructions both reach the model.
        assertTrue(receivedRequest.contains("Linear equations for first-year students"));
        assertTrue(receivedRequest.contains("Fractions and percentages"));
        assertTrue(receivedRequest.contains("Focus on mental arithmetic"));
        assertEquals(1, calls);
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

    @Test void existingBankQuestionsAreSentAsContextAndNeverDuplicated() throws Exception {
        em.persist(Question.builder().module(module).content("What is 2 + 2?").questionType("SINGLE_CHOICE")
                .difficulty("EASY").status("ACTIVE").approvalStatus("APPROVED").build());
        retryContent = json.writeValueAsString(Map.of("questions", List.of(choice("SINGLE_CHOICE", "EASY", "What is 3 + 3?"))));
        generate(assigned, body()).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.questions[0].content").value("What is 3 + 3?"))
                .andExpect(jsonPath("$.data.warnings[0]").value(org.hamcrest.Matchers.containsString("duplicates")));
        assertTrue(receivedRequest.contains("existingQuestions"));
        assertEquals(2, calls);
    }

    @Test void invalidAnswersAndWrongDistributionAreRemovedWithWarnings() throws Exception {
        Map<String, Object> wrong = choice("SINGLE_CHOICE", "HARD");
        Map<String, Object> invalid = Map.of("content", "Invalid answer", "questionType", "SINGLE_CHOICE", "difficulty", "EASY",
                "options", List.of(Map.of("optionText", "A", "isCorrect", true), Map.of("optionText", "B", "isCorrect", true)));
        providerContent = json.writeValueAsString(Map.of("questions", List.of(invalid, wrong, choice("SINGLE_CHOICE", "EASY"))));
        generate(manager, body()).andExpect(status().isOk()).andExpect(jsonPath("$.data.questionCount").value(1))
                .andExpect(jsonPath("$.data.warnings").isNotEmpty());
    }

    @Test void returnsSaveReadyAnswerKeysAndNormalizedEssayRubric() throws Exception {
        List<Map<String, Object>> questions = List.of(choice("SINGLE_CHOICE", "EASY"),
                Map.of("content", "Pick the even numbers", "questionType", "MULTIPLE_CHOICE", "difficulty", "EASY", "options", List.of(
                        Map.of("optionText", "2", "isCorrect", true), Map.of("optionText", "4", "isCorrect", true),
                        Map.of("optionText", "3", "isCorrect", false))),
                Map.of("content", "2 is even", "questionType", "TRUE_FALSE", "difficulty", "EASY", "options", List.of(
                        Map.of("optionText", "True", "isCorrect", true), Map.of("optionText", "False", "isCorrect", false))),
                Map.of("content", "2 + {{1}} = 5", "questionType", "FILL_BLANK", "difficulty", "EASY",
                        "answerKey", Map.of("blanks", List.of(Map.of("index", 1, "accepted", List.of("3"), "caseSensitive", false)))),
                Map.of("content", "Match the sums", "questionType", "MATCHING", "difficulty", "EASY",
                        "answerKey", Map.of("pairs", List.of(Map.of("left", "1+1", "right", "2"), Map.of("left", "1+2", "right", "3")))),
                Map.of("content", "Explain why 0.1 + 0.2 is not exactly 0.3 in floating point.", "questionType", "ESSAY", "difficulty", "EASY",
                        "explanation", "Binary fractions",
                        "essayGradingRubric", Map.of("criteria", List.of(Map.of("name", "Accuracy", "weight", 3, "descriptors", "Full: ..."),
                                Map.of("name", "Clarity", "weight", 1, "descriptors", Map.of("full", "clear steps"))),
                                "notes", List.of("Mention binary representation", "Rounding error"))));
        providerContent = json.writeValueAsString(Map.of("questions", questions));
        String request = json.writeValueAsString(Map.of("courseId", course.getCourseId(), "questionCount", 6,
                "difficultyDistribution", Map.of("EASY", 6, "MEDIUM", 0, "HARD", 0),
                "questionTypes", questions.stream().map(q -> Map.of("questionType", q.get("questionType"), "count", 1)).toList()));
        generate(manager, request).andExpect(status().isOk()).andExpect(jsonPath("$.data.questionCount").value(6))
                .andExpect(jsonPath("$.data.warnings").isEmpty())
                .andExpect(jsonPath("$.data.questions[1].options[2].orderIndex").value(2))
                .andExpect(jsonPath("$.data.questions[3].answerKey.blanks[0].accepted[0]").value("3"))
                .andExpect(jsonPath("$.data.questions[4].answerKey.pairs[1].right").value("3"))
                .andExpect(jsonPath("$.data.questions[5].essayGradingRubric.criteria[0].weight").value(3.0))
                .andExpect(jsonPath("$.data.questions[5].essayGradingRubric.criteria[1].descriptors").value("full: clear steps"))
                .andExpect(jsonPath("$.data.questions[5].essayGradingRubric.notes").value("Mention binary representation\nRounding error"));
        assertEquals(1, calls);
    }

    @Test void emptyAnswerKeyAndRubricOnChoiceQuestionAreDropped() throws Exception {
        Map<String, Object> question = new java.util.HashMap<>(choice("SINGLE_CHOICE", "EASY"));
        question.put("answerKey", Map.of());
        question.put("essayGradingRubric", Map.of("criteria", List.of(Map.of("name", "Accuracy", "maxScore", 1)), "notes", "n/a"));
        providerContent = json.writeValueAsString(Map.of("questions", List.of(question)));
        generate(manager, body()).andExpect(status().isOk()).andExpect(jsonPath("$.data.questionCount").value(1))
                .andExpect(jsonPath("$.data.questions[0].answerKey").doesNotExist())
                .andExpect(jsonPath("$.data.questions[0].essayGradingRubric").doesNotExist());
    }

    @Test void orderingDraftReturnsShuffledKeyedOptionsAndSavesToQuestionBank() throws Exception {
        try (var in = getClass().getClassLoader().getResourceAsStream("prompts/ordering.txt")) {
            assertNotNull(in, "prompts/ordering.txt should exist on classpath");
            assertFalse(new String(in.readAllBytes(), StandardCharsets.UTF_8).isBlank());
        }
        providerContent = json.writeValueAsString(Map.of(
                "title", "Ordering Draft",
                "questions", List.of(Map.of(
                        "content", "Put the steps in order.",
                        "questionType", "ORDERING",
                        "difficulty", "EASY",
                        "defaultPoints", 1,
                        "explanation", "Understand first, analyse, then design.",
                        "options", List.of(
                                Map.of("key", "k3", "optionText", "Design", "orderIndex", 0),
                                Map.of("key", "k1", "optionText", "Identify the problem", "orderIndex", 1),
                                Map.of("key", "k2", "optionText", "Analyse requirements", "orderIndex", 2)),
                        "answerKey", Map.of("correctOrder", List.of("k1", "k2", "k3"))))));
        String aiRes = generate(manager, body().replace("SINGLE_CHOICE", "ORDERING"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.questionCount").value(1))
                .andExpect(jsonPath("$.data.warnings").isEmpty())
                .andExpect(jsonPath("$.data.questions[0].questionType").value("ORDERING"))
                .andExpect(jsonPath("$.data.questions[0].options[0].key").value("k3"))
                .andExpect(jsonPath("$.data.questions[0].options[0].optionText").value("Design"))
                .andExpect(jsonPath("$.data.questions[0].options[0].orderIndex").value(0))
                .andExpect(jsonPath("$.data.questions[0].options[0].isCorrect").doesNotExist())
                .andExpect(jsonPath("$.data.questions[0].options[1].key").value("k1"))
                .andExpect(jsonPath("$.data.questions[0].options[1].orderIndex").value(1))
                .andExpect(jsonPath("$.data.questions[0].options[1].isCorrect").doesNotExist())
                .andExpect(jsonPath("$.data.questions[0].options[2].key").value("k2"))
                .andExpect(jsonPath("$.data.questions[0].options[2].orderIndex").value(2))
                .andExpect(jsonPath("$.data.questions[0].options[2].isCorrect").doesNotExist())
                .andExpect(jsonPath("$.data.questions[0].answerKey.correctOrder[0]").value("k1"))
                .andExpect(jsonPath("$.data.questions[0].answerKey.correctOrder[1]").value("k2"))
                .andExpect(jsonPath("$.data.questions[0].answerKey.correctOrder[2]").value("k3"))
                .andReturn().getResponse().getContentAsString();

        JsonNode reqNode = json.readTree(receivedRequest);
        JsonNode qProps = reqNode.path("generationConfig").path("responseSchema")
                .path("properties").path("questions").path("items").path("properties");
        List<String> enumTypes = new java.util.ArrayList<>();
        qProps.path("questionType").path("enum").forEach(n -> enumTypes.add(n.asText()));
        assertTrue(enumTypes.contains("ORDERING"));
        assertTrue(qProps.path("options").path("items").path("properties").has("key"));
        List<String> optReq = new java.util.ArrayList<>();
        qProps.path("options").path("items").path("required").forEach(n -> optReq.add(n.asText()));
        assertFalse(optReq.contains("isCorrect"));
        assertTrue(qProps.path("answerKey").path("properties").has("correctOrder"));

        var draftNode = (com.fasterxml.jackson.databind.node.ObjectNode) json.readTree(aiRes)
                .path("data").path("questions").get(0).deepCopy();
        draftNode.put("courseId", course.getCourseId());
        String batchRes = call(manager, post("/api/v1/manager/questions/batch")
                .param("courseId", course.getCourseId().toString())
                .contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(List.of(draftNode))))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();

        JsonNode saved = json.readTree(batchRes).path("data").get(0);
        Map<String, Long> idByText = new java.util.HashMap<>();
        saved.path("options").forEach(o -> idByText.put(o.path("optionText").asText(), o.path("optionId").asLong()));
        List<Long> savedOrder = new java.util.ArrayList<>();
        saved.path("answerKey").path("correctOrder").forEach(n -> savedOrder.add(n.asLong()));
        assertEquals(
                List.of(idByText.get("Identify the problem"), idByText.get("Analyse requirements"), idByText.get("Design")),
                savedOrder);
    }

    @Test void orderingFromMaterialNormalizesUnshuffledOptionsAndSchemaNoise() throws Exception {
        providerContent = json.writeValueAsString(Map.of(
                "title", "Material Ordering",
                "questions", List.of(Map.of(
                        "content", "Order the SDLC stages.",
                        "questionType", "ORDERING",
                        "difficulty", "EASY",
                        "options", List.of(
                                Map.of("key", "k1", "optionText", "Identify", "isCorrect", false, "orderIndex", 1),
                                Map.of("key", "k2", "optionText", "Analyse", "isCorrect", false, "orderIndex", 2),
                                Map.of("key", "k3", "optionText", "Design", "isCorrect", false, "orderIndex", 3)),
                        "answerKey", Map.of(
                                "correctOrder", List.of("k1", "k2", "k3"),
                                "blanks", List.of(),
                                "pairs", List.of())))));
        MockMultipartFile file = new MockMultipartFile("file", "sdlc.txt", "text/plain",
                "SDLC steps: Identify, Analyse, Design".getBytes(StandardCharsets.UTF_8));
        call(manager, multipart(path() + "-from-material").file(file)
                .param("courseId", course.getCourseId().toString())
                .param("moduleId", module.getModuleId().toString())
                .param("questionCount", "1")
                .param("difficultyDistribution", "{\"EASY\":1,\"MEDIUM\":0,\"HARD\":0}")
                .param("questionTypes", "[{\"questionType\":\"ORDERING\",\"count\":1}]"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.questionCount").value(1))
                .andExpect(jsonPath("$.data.warnings").isEmpty())
                .andExpect(jsonPath("$.data.questions[0].options[0].key").value("k2"))
                .andExpect(jsonPath("$.data.questions[0].options[0].orderIndex").value(0))
                .andExpect(jsonPath("$.data.questions[0].options[0].isCorrect").doesNotExist())
                .andExpect(jsonPath("$.data.questions[0].options[1].key").value("k3"))
                .andExpect(jsonPath("$.data.questions[0].options[1].orderIndex").value(1))
                .andExpect(jsonPath("$.data.questions[0].options[2].key").value("k1"))
                .andExpect(jsonPath("$.data.questions[0].options[2].orderIndex").value(2))
                .andExpect(jsonPath("$.data.questions[0].answerKey.correctOrder[0]").value("k1"))
                .andExpect(jsonPath("$.data.questions[0].answerKey.correctOrder[1]").value("k2"))
                .andExpect(jsonPath("$.data.questions[0].answerKey.correctOrder[2]").value("k3"))
                .andExpect(jsonPath("$.data.questions[0].answerKey.blanks").doesNotExist())
                .andExpect(jsonPath("$.data.questions[0].answerKey.pairs").doesNotExist());
    }

    @Test void rejectsInvalidOrderingDrafts() throws Exception {
        List<Map<String, Object>> invalid = List.of(
                Map.of("content", "Missing correct order", "questionType", "ORDERING", "difficulty", "EASY",
                        "options", List.of(
                                Map.of("key", "k1", "optionText", "A", "orderIndex", 0),
                                Map.of("key", "k2", "optionText", "B", "orderIndex", 1))),
                Map.of("content", "Unknown key in correct order", "questionType", "ORDERING", "difficulty", "EASY",
                        "options", List.of(
                                Map.of("key", "k1", "optionText", "A", "orderIndex", 0),
                                Map.of("key", "k2", "optionText", "B", "orderIndex", 1)),
                        "answerKey", Map.of("correctOrder", List.of("k1", "k99"))),
                Map.of("content", "Missing option key", "questionType", "ORDERING", "difficulty", "EASY",
                        "options", List.of(
                                Map.of("optionText", "A", "orderIndex", 0),
                                Map.of("key", "k2", "optionText", "B", "orderIndex", 1)),
                        "answerKey", Map.of("correctOrder", List.of("k1", "k2"))));
        providerContent = json.writeValueAsString(Map.of("questions", invalid));
        String request = json.writeValueAsString(Map.of(
                "courseId", course.getCourseId(),
                "questionCount", 3,
                "difficultyDistribution", Map.of("EASY", 3, "MEDIUM", 0, "HARD", 0),
                "questionTypes", List.of(Map.of("questionType", "ORDERING", "count", 3))));
        generate(manager, request)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.questionCount").value(0))
                .andExpect(jsonPath("$.data.warnings.length()").value(7));
        assertEquals(2, calls);
    }

    @Test void diagramDraftCarriesDrawioXmlAndRubric() throws Exception {
        Map<String, Object> rubric = Map.of("criteria", List.of(Map.of("name", "Classes", "weight", 2, "descriptors", "Full: ..."),
                Map.of("name", "Relations", "weight", 2, "descriptors", "Full: ...")), "notes", "Order has many lines");
        Map<String, Object> graph = Map.of(
                "diagramType", "CLASS",
                "nodes", List.of(Map.of("id", "n1", "label", "Order", "kind", "CLASS"), Map.of("id", "n2", "label", "Line", "kind", "CLASS")),
                "edges", List.of(Map.of("id", "e1", "from", "n1", "to", "n2", "label", "contains", "kind", "COMPOSITION"))
        );
        List<Map<String, Object>> questions = List.of(
                Map.of("content", "Draw the class diagram of an order", "questionType", "DIAGRAM", "difficulty", "EASY",
                        "graph", graph, "essayGradingRubric", rubric),
                Map.of("content", "Diagram without graph", "questionType", "DIAGRAM", "difficulty", "EASY",
                        "essayGradingRubric", rubric),
                Map.of("content", "Diagram without rubric", "questionType", "DIAGRAM", "difficulty", "EASY",
                        "graph", graph));
        providerContent = json.writeValueAsString(Map.of("questions", questions));
        String request = json.writeValueAsString(Map.of("courseId", course.getCourseId(), "questionCount", 3,
                "difficultyDistribution", Map.of("EASY", 3, "MEDIUM", 0, "HARD", 0),
                "questionTypes", List.of(Map.of("questionType", "DIAGRAM", "count", 3))));
        generate(manager, request).andExpect(status().isOk()).andExpect(jsonPath("$.data.questionCount").value(1))
                .andExpect(jsonPath("$.data.questions[0].graph.diagramType").value("CLASS"))
                .andExpect(jsonPath("$.data.questions[0].questionMetadata.drawioXml").value(org.hamcrest.Matchers.allOf(
                        org.hamcrest.Matchers.startsWith("<mxfile>"), org.hamcrest.Matchers.containsString("n-n1"),
                        org.hamcrest.Matchers.containsString("Order"), org.hamcrest.Matchers.containsString("e-e1"))))
                .andExpect(jsonPath("$.data.questions[0].essayGradingRubric.criteria[0].weight").value(2.0))
                .andExpect(jsonPath("$.data.warnings[*]").value(org.hamcrest.Matchers.hasItems(
                        org.hamcrest.Matchers.containsString("graph"), org.hamcrest.Matchers.containsString("diagram requires an essayGradingRubric"))));
        assertTrue(receivedRequest.contains("graph"));
        assertFalse(receivedRequest.contains("plantUmlSource"));
    }

    @Test void mixedCodeAndDiagramUsesRubricSchemaAndVietnameseEnforcesDiacritics() throws Exception {
        Map<String, Object> rubric = Map.of(
                "criteria", List.of(Map.of("name", "Cấu trúc", "weight", 3, "descriptors", "Đầy đủ thực thể")),
                "notes", "Ghi rõ quan hệ");
        Map<String, Object> graph = Map.of(
                "diagramType", "ENTITY",
                "nodes", List.of(Map.of("id", "n1", "label", "Khách hàng", "kind", "ENTITY")),
                "edges", List.of());
        Map<String, Object> codeQ = Map.of(
                "content", "Tính tổng hai số nguyên.",
                "questionType", "CODE",
                "difficulty", "HARD",
                "essayGradingRubric", Map.of("criteria", List.of(Map.of("name", "Ignored", "weight", 1)), "notes", "Ignored"),
                "codeConfig", Map.of("allowedLanguages", List.of("JAVA"), "timeLimitMs", 5000, "memoryLimitKb", 262144),
                "testCases", List.of(
                        Map.of("inputData", "1 2", "expectedOutput", "3", "hidden", false),
                        Map.of("inputData", "5 7", "expectedOutput", "12", "hidden", true),
                        Map.of("inputData", "0 0", "expectedOutput", "0", "hidden", true)));
        Map<String, Object> diagramQ = Map.of(
                "content", "Vẽ sơ đồ thực thể cho Khách hàng.",
                "questionType", "DIAGRAM",
                "difficulty", "HARD",
                "graph", graph,
                "essayGradingRubric", rubric);
        Map<String, Object> diagramEssayQ = Map.of(
                "content", "Vẽ sơ đồ và giải thích quy trình Đặt hàng.",
                "questionType", "DIAGRAM_ESSAY",
                "difficulty", "HARD",
                "graph", graph,
                "essayGradingRubric", rubric);
        providerContent = json.writeValueAsString(Map.of("questions", List.of(codeQ, diagramQ, diagramEssayQ)));
        String request = json.writeValueAsString(Map.of(
                "courseId", course.getCourseId(),
                "questionCount", 3,
                "difficultyDistribution", Map.of("EASY", 0, "MEDIUM", 0, "HARD", 3),
                "questionTypes", List.of(
                        Map.of("questionType", "CODE", "count", 1),
                        Map.of("questionType", "DIAGRAM", "count", 1),
                        Map.of("questionType", "DIAGRAM_ESSAY", "count", 1)),
                "language", "vi"));

        generate(manager, request)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.questionCount").value(3))
                .andExpect(jsonPath("$.data.warnings").isEmpty())
                .andExpect(jsonPath("$.data.questions[0].essayGradingRubric").doesNotExist())
                .andExpect(jsonPath("$.data.questions[1].questionMetadata.drawioXml").value(org.hamcrest.Matchers.containsString("Khách hàng")))
                .andExpect(jsonPath("$.data.questions[2].essayGradingRubric.notes").value("Ghi rõ quan hệ"));

        assertTrue(requiredQuestionFields().contains("essayGradingRubric"),
                "Mixed batches containing DIAGRAM/DIAGRAM_ESSAY alongside CODE must keep essayGradingRubric required");
        assertTrue(receivedRequest.contains("CÓ DẤU ĐẦY ĐỦ"),
                "Vietnamese requests must instruct the model to use full Vietnamese diacritics");
    }

    private String requiredQuestionFields() throws Exception {
        return json.readTree(receivedRequest).path("generationConfig").path("responseSchema").path("properties")
                .path("questions").path("items").path("required").toString();
    }

    @Test void retriesOnceForRejectedQuestionsAndReportsWhy() throws Exception {
        providerContent = json.writeValueAsString(Map.of("questions", List.of(Map.of("content", "Valid content", "questionType", "INVALID",
                "difficulty", "EASY"))));
        retryContent = json.writeValueAsString(Map.of("questions", List.of(choice("SINGLE_CHOICE", "EASY"))));
        generate(manager, body()).andExpect(status().isOk()).andExpect(jsonPath("$.data.questionCount").value(1));
        assertEquals(2, calls);
        assertTrue(receivedRequest.contains("previousProblems") && receivedRequest.contains("questionType"));
    }

    @Test void acceptsFrontendMultiChoiceAlias() throws Exception {
        providerContent = json.writeValueAsString(Map.of("questions", List.of(Map.of("content", "Pick the even numbers",
                "questionType", "MULTIPLE_CHOICE", "difficulty", "EASY", "options", List.of(
                        Map.of("optionText", "2", "isCorrect", true), Map.of("optionText", "4", "isCorrect", true),
                        Map.of("optionText", "3", "isCorrect", false))))));
        generate(manager, body().replace("SINGLE_CHOICE", "MULTI_CHOICE")).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.questions[0].questionType").value("MULTIPLE_CHOICE"));
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

    @Test void rejectsDraftsTheQuestionBankWouldRefuse() throws Exception {
        List<Map<String, Object>> invalid = List.of(
                Map.of("content", "One correct only", "questionType", "MULTIPLE_CHOICE", "difficulty", "EASY", "options", List.of(
                        Map.of("optionText", "a", "isCorrect", true), Map.of("optionText", "b", "isCorrect", false))),
                Map.of("content", "Match with options", "questionType", "MATCHING", "difficulty", "EASY", "options", List.of(
                        Map.of("optionText", "a"), Map.of("optionText", "b"))),
                Map.of("content", "No placeholder", "questionType", "FILL_BLANK", "difficulty", "EASY",
                        "answerKey", Map.of("blanks", List.of(Map.of("index", 1, "accepted", List.of("x"))))),
                Map.of("content", "Essay without rubric", "questionType", "ESSAY", "difficulty", "EASY"),
                Map.of("content", "Rubric invalid weight", "questionType", "ESSAY", "difficulty", "MEDIUM",
                        "essayGradingRubric", Map.of("criteria", List.of(Map.of("name", "Accuracy", "weight", 0)))));
        providerContent = json.writeValueAsString(Map.of("questions", invalid));
        String request = json.writeValueAsString(Map.of("courseId", course.getCourseId(), "questionCount", 5,
                "difficultyDistribution", Map.of("EASY", 4, "MEDIUM", 1, "HARD", 0),
                "questionTypes", List.of(Map.of("questionType", "MULTIPLE_CHOICE", "count", 1), Map.of("questionType", "MATCHING", "count", 1),
                        Map.of("questionType", "FILL_BLANK", "count", 1), Map.of("questionType", "ESSAY", "count", 2))));
        // 5 rejected on the first call, 5 again on the retry, plus the final "Only 0/5" summary.
        generate(manager, request).andExpect(status().isOk()).andExpect(jsonPath("$.data.questionCount").value(0))
                .andExpect(jsonPath("$.data.warnings.length()").value(11));
        assertEquals(2, calls);
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

    @Test void multiModuleAiGenerateAndBatchSaveAcrossModules() throws Exception {
        Module module2 = Module.builder().course(course).title("Geometry").description("Triangles and circles").orderIndex(2).build();
        em.persist(module2);
        em.flush();

        Map<String, Object> q1 = new java.util.LinkedHashMap<>(choice("SINGLE_CHOICE", "EASY", "What is 1/2 + 1/2?"));
        q1.put("moduleId", module.getModuleId());
        Map<String, Object> q2 = new java.util.LinkedHashMap<>(choice("SINGLE_CHOICE", "MEDIUM", "Sum of angles in a triangle?"));
        q2.put("moduleId", module2.getModuleId());
        providerContent = json.writeValueAsString(Map.of("title", "Midterm", "questions", List.of(q1, q2)));

        String aiReq = json.writeValueAsString(Map.of(
                "courseId", course.getCourseId(),
                "moduleIds", List.of(module.getModuleId(), module2.getModuleId()),
                "questionCount", 2,
                "difficultyDistribution", Map.of("EASY", 1, "MEDIUM", 1, "HARD", 0),
                "questionTypes", List.of(Map.of("questionType", "SINGLE_CHOICE", "count", 2)),
                "language", "en",
                "context", "Cover both arithmetic and geometry"));

        String aiRes = generate(manager, aiReq)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.questionCount").value(2))
                .andExpect(jsonPath("$.data.questions[0].moduleId").value(module.getModuleId()))
                .andExpect(jsonPath("$.data.questions[1].moduleId").value(module2.getModuleId()))
                .andReturn().getResponse().getContentAsString();
        assertTrue(receivedRequest.contains("Geometry"));

        JsonNode draftQuestions = json.readTree(aiRes).path("data").path("questions");
        List<Map<String, Object>> batchBody = List.of(
                Map.of("courseId", course.getCourseId(), "moduleId", draftQuestions.get(0).path("moduleId").asLong(),
                        "questionType", "SINGLE_CHOICE", "difficulty", "EASY",
                        "content", "Batch multi-module Q1",
                        "options", List.of(Map.of("optionText", "A", "isCorrect", true, "orderIndex", 0), Map.of("optionText", "B", "isCorrect", false, "orderIndex", 1))),
                Map.of("courseId", course.getCourseId(), "moduleId", draftQuestions.get(1).path("moduleId").asLong(),
                        "questionType", "SINGLE_CHOICE", "difficulty", "MEDIUM",
                        "content", "Batch multi-module Q2",
                        "options", List.of(Map.of("optionText", "C", "isCorrect", true, "orderIndex", 0), Map.of("optionText", "D", "isCorrect", false, "orderIndex", 1)))
        );

        String batchRes = call(manager, post("/api/v1/manager/questions/batch")
                .param("courseId", course.getCourseId().toString())
                .contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(batchBody)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data[0].moduleId").value(module.getModuleId()))
                .andExpect(jsonPath("$.data[1].moduleId").value(module2.getModuleId()))
                .andReturn().getResponse().getContentAsString();

        JsonNode created = json.readTree(batchRes).path("data");
        long id1 = created.get(0).path("questionId").asLong();
        long id2 = created.get(1).path("questionId").asLong();

        call(manager, patch("/api/v1/manager/questions/batch/status")
                .contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("questionIds", List.of(id1, id2), "status", "ACTIVE"))))
                .andExpect(status().isOk());

        call(manager, post("/api/v1/manager/exams")
                .contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of(
                        "title", "Comprehensive Midterm",
                        "courseId", course.getCourseId(),
                        "durationMinutes", 45,
                        "mode", "EXAM",
                        "generationType", "STATIC",
                        "maxScore", 10,
                        "questionIds", List.of(
                                Map.of("questionId", id1, "weight", 1, "orderIndex", 0),
                                Map.of("questionId", id2, "weight", 1, "orderIndex", 1))))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.moduleId").doesNotExist())
                .andExpect(jsonPath("$.data.questionCount").value(2));
    }

    @Test void archiveQuestionInDraftExamBlocksPublishWhilePublishedExamBlocksArchive() throws Exception {
        List<Map<String, Object>> batch = List.of(
                Map.of("courseId", course.getCourseId(), "moduleId", module.getModuleId(),
                        "questionType", "SINGLE_CHOICE", "difficulty", "EASY",
                        "content", "Draft exam question to archive",
                        "options", List.of(Map.of("optionText", "Yes", "isCorrect", true, "orderIndex", 0), Map.of("optionText", "No", "isCorrect", false, "orderIndex", 1))),
                Map.of("courseId", course.getCourseId(), "moduleId", module.getModuleId(),
                        "questionType", "SINGLE_CHOICE", "difficulty", "EASY",
                        "content", "Published exam question cannot archive",
                        "options", List.of(Map.of("optionText", "Yes", "isCorrect", true, "orderIndex", 0), Map.of("optionText", "No", "isCorrect", false, "orderIndex", 1)))
        );
        String batchRes = call(manager, post("/api/v1/manager/questions/batch")
                .param("courseId", course.getCourseId().toString())
                .contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(batch)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        long draftQId = json.readTree(batchRes).path("data").get(0).path("questionId").asLong();
        long publishedQId = json.readTree(batchRes).path("data").get(1).path("questionId").asLong();

        call(manager, patch("/api/v1/manager/questions/batch/status")
                .contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("questionIds", List.of(draftQId, publishedQId), "status", "ACTIVE"))))
                .andExpect(status().isOk());

        String draftExamRes = call(manager, post("/api/v1/manager/exams")
                .contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of(
                        "title", "Draft Exam", "courseId", course.getCourseId(), "durationMinutes", 30,
                        "mode", "EXAM", "generationType", "STATIC", "maxScore", 10,
                        "questionIds", List.of(Map.of("questionId", draftQId, "weight", 1, "orderIndex", 0))))))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        long draftExamId = json.readTree(draftExamRes).path("data").path("examId").asLong();

        // Archiving a question in a DRAFT exam is allowed, but publishing that DRAFT exam is then blocked (409).
        call(manager, patch("/api/v1/manager/questions/" + draftQId + "/status")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"status\":\"ARCHIVED\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("ARCHIVED"));

        call(manager, patch("/api/v1/manager/exams/" + draftExamId + "/publish")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"status\":\"PUBLISHED\"}"))
                .andExpect(status().isConflict());

        String pubExamRes = call(manager, post("/api/v1/manager/exams")
                .contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of(
                        "title", "Published Exam", "courseId", course.getCourseId(), "durationMinutes", 30,
                        "mode", "EXAM", "generationType", "STATIC", "maxScore", 10,
                        "questionIds", List.of(Map.of("questionId", publishedQId, "weight", 1, "orderIndex", 0))))))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        long pubExamId = json.readTree(pubExamRes).path("data").path("examId").asLong();

        call(manager, patch("/api/v1/manager/exams/" + pubExamId + "/publish")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"status\":\"PUBLISHED\"}"))
                .andExpect(status().isOk());

        // Archiving a question in a PUBLISHED exam is blocked (409).
        call(manager, patch("/api/v1/manager/questions/" + publishedQId + "/status")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"status\":\"ARCHIVED\"}"))
                .andExpect(status().isConflict());
    }

    @Test void sharedPassageIsIncludedInPromptWhenProvided() throws Exception {
        String passage = "Photosynthesis converts light energy into chemical energy inside chloroplasts.";
        String reqBody = json.writeValueAsString(Map.of(
                "courseId", course.getCourseId(),
                "moduleId", module.getModuleId(),
                "title", "Biology Passage 1",
                "questionCount", 1,
                "difficultyDistribution", Map.of("EASY", 1, "MEDIUM", 0, "HARD", 0),
                "questionTypes", List.of(Map.of("questionType", "SINGLE_CHOICE", "count", 1)),
                "language", "en",
                "passageText", passage));

        generate(manager, reqBody)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.questionCount").value(1));

        JsonNode reqNode = json.readTree(receivedRequest);
        String promptText = reqNode.path("contents").get(0).path("parts").get(0).path("text").asText();
        JsonNode promptJson = json.readTree(promptText);
        assertEquals(passage, promptJson.path("sharedPassage").asText());
        assertTrue(promptJson.has("sharedPassageRule"));
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
            "questionTypes", List.of(Map.of("questionType", "SINGLE_CHOICE", "count", 1)), "language", "en",
            "context", "Focus on mental arithmetic")); }
    private static String path() { return "/api/v1/manager/exams/ai/generate"; }
    private long countQuestions() { return em.createQuery("select count(q) from Question q", Long.class).getSingleResult(); }
    private Map<String, Object> choice(String type, String difficulty) { return choice(type, difficulty, "What is 2 + 2?"); }
    private Map<String, Object> choice(String type, String difficulty, String content) {
        return Map.of("content", content, "questionType", type, "difficulty", difficulty,
                "options", List.of(Map.of("optionText", "4", "isCorrect", true, "orderIndex", 0), Map.of("optionText", "3", "isCorrect", false, "orderIndex", 1)));
    }
    private User account(String role) {
        User value = User.builder().email(UUID.randomUUID() + "@example.com").fullName(role).passwordHash("test-hash").roleName(role).build();
        em.persist(value); return value;
    }
}
