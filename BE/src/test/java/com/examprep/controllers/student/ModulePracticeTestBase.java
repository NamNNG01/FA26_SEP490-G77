package com.examprep.controllers.student;

import com.examprep.entities.*;
import com.examprep.entities.Module;
import com.examprep.security.UserPrincipal;
import com.examprep.services.ModulePracticeGradingWorker;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.transaction.annotation.Transactional;

import javax.sql.DataSource;
import java.math.BigDecimal;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.ConcurrentLinkedDeque;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Shared fixtures and HTTP plumbing for the Module Practice integration tests.
 *
 * <p>Runs on the standard {@code test} profile (in-memory H2 in PostgreSQL mode, Flyway disabled,
 * entities building the schema) against a local fake Gemini endpoint, exactly like
 * {@code StudentAiApiIntegrationTest}. The AI worker runs with zero threads so each test drives
 * {@link ModulePracticeGradingWorker#gradeNext()} by hand and never races the assertions.</p>
 *
 * <p>Fixture shape: one course with a VISIBLE module A holding one question of every supported type,
 * a VISIBLE module B with three choice questions, an empty VISIBLE module C, a HIDDEN module D and a
 * second course with module E the student is not enrolled in. The student is enrolled in the first
 * course only; a second student is enrolled in nothing.</p>
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
public abstract class ModulePracticeTestBase {

    protected static final ObjectMapper JSON = new ObjectMapper();
    private static final HttpServer PROVIDER;
    private static final ExecutorService WORKERS = Executors.newCachedThreadPool();
    protected static final Deque<String> REPLIES = new ConcurrentLinkedDeque<>();
    protected static final List<String> REQUESTS = Collections.synchronizedList(new ArrayList<>());
    protected static volatile int providerStatus = 200;

    protected static final String DIAGRAM_XML = """
            <mxfile><diagram id="d"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>
            <mxCell id="a" value="Customer" style="shape=umlActor;" vertex="1" parent="1"><mxGeometry x="1" y="2" as="geometry"/></mxCell>
            <mxCell id="b" value="Order" style="rounded=1;" vertex="1" parent="1"><mxGeometry as="geometry"/></mxCell>
            <mxCell id="e" value="places" style="endArrow=block;" edge="1" parent="1" source="a" target="b"><mxGeometry as="geometry"/></mxCell>
            </root></mxGraphModel></diagram></mxfile>""";

    /** A one-criterion rubric: the AI must return exactly one criterion, and it owns all the points. */
    protected static final String RUBRIC = "{\"criteria\":[{\"name\":\"Overall\",\"weight\":1}]}";

    static {
        try {
            PROVIDER = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            PROVIDER.setExecutor(WORKERS);
            PROVIDER.createContext("/v1beta/models/", exchange -> {
                REQUESTS.add(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
                String reply = Objects.requireNonNullElse(REPLIES.poll(), "{}");
                byte[] bytes = JSON.writeValueAsBytes(Map.of(
                        "candidates", List.of(Map.of("content", Map.of("parts", List.of(Map.of("text", reply))))),
                        "usageMetadata", Map.of("promptTokenCount", 120, "candidatesTokenCount", 80)));
                exchange.getResponseHeaders().set("Content-Type", "application/json");
                exchange.sendResponseHeaders(providerStatus, bytes.length);
                exchange.getResponseBody().write(bytes);
                exchange.close();
            });
            PROVIDER.start();
        } catch (java.io.IOException ex) {
            throw new ExceptionInInitializerError(ex);
        }
    }

    @DynamicPropertySource
    static void providerProperties(DynamicPropertyRegistry registry) {
        registry.add("app.ai.api-key", () -> "local-fake-provider-key");
        registry.add("app.ai.model", () -> "fake-model");
        registry.add("app.ai.base-url", () -> "http://127.0.0.1:" + PROVIDER.getAddress().getPort() + "/v1beta");
        registry.add("app.student-ai.grading-threads", () -> 0);
        registry.add("app.student-ai.sweep-ms", () -> 3_600_000);
        registry.add("app.student-ai.free-monthly-tokens", () -> 10_000);
    }

    /**
     * The stub provider lives as long as the test JVM: Spring caches the application context (and the
     * app.ai.base-url bound to this server port) across test classes, so stopping it after one class
     * would leave every later AI test without a provider.
     */
    static {
        Runtime.getRuntime().addShutdownHook(new Thread(() -> {
            PROVIDER.stop(0);
            WORKERS.shutdownNow();
        }, "fake-ai-provider-shutdown"));
    }

    /** H2 stand-in for Postgres' pg_advisory_xact_lock. */
    public static Integer advisoryLock(Long key) {
        return 0;
    }

    @Autowired protected MockMvc mvc;
    @Autowired protected ObjectMapper json;
    @Autowired protected EntityManager em;
    @Autowired protected DataSource dataSource;
    @Autowired protected ModulePracticeGradingWorker gradingWorker;

    protected User student;
    protected User otherStudent;
    protected User brokeStudent;
    protected Course course;
    protected Course otherCourse;
    protected Module moduleA;
    protected Module moduleB;
    protected Module moduleC;
    protected Module moduleD;
    protected Module moduleE;

    protected Question single;
    protected Question multi;
    protected Question trueFalse;
    protected Question fillBlank;
    protected Question ordering;
    protected Question matching;
    protected Question essay;
    protected Question diagram;
    protected Question code;
    protected AnswerOption singleRight;
    protected AnswerOption singleWrong;
    protected AnswerOption trueFalseRight;
    protected AnswerOption multiRightOne;
    protected AnswerOption multiRightTwo;
    protected AnswerOption multiWrong;
    protected AnswerOption orderingFirst;
    protected AnswerOption orderingSecond;
    protected AnswerOption orderingThird;
    protected List<Question> moduleBQuestions = new ArrayList<>();

    protected QuestionGroup group;
    protected Exam exam;
    protected ExamAttempt examAttempt;
    protected AttemptAnswer examAnswer;
    protected StudentQuestionReview notebookRow;
    protected Deck deck;
    protected Flashcard card;
    protected UserCardProgress cardProgress;

    @BeforeEach
    void fixtures() throws Exception {
        try (Connection connection = dataSource.getConnection()) {
            connection.createStatement().execute("CREATE ALIAS IF NOT EXISTS pg_advisory_xact_lock FOR '"
                    + ModulePracticeTestBase.class.getName() + ".advisoryLock'");
        }
        REPLIES.clear();
        REQUESTS.clear();
        providerStatus = 200;

        student = account(User.ROLE_STUDENT);
        otherStudent = account(User.ROLE_STUDENT);
        brokeStudent = account(User.ROLE_STUDENT);
        User manager = account(User.ROLE_COURSE_MANAGER);

        Category category = Category.builder().name("Java").slug(UUID.randomUUID().toString()).build();
        em.persist(category);
        course = Course.builder().categoryId(category.getCategoryId()).category(category).manager(manager)
                .title("Java basics").slug(UUID.randomUUID().toString()).isPublished(true).build();
        em.persist(course);
        otherCourse = Course.builder().categoryId(category.getCategoryId()).category(category).manager(manager)
                .title("Advanced Java").slug(UUID.randomUUID().toString()).isPublished(true).build();
        em.persist(otherCourse);

        moduleA = module(course, "OOP", Module.STATUS_VISIBLE);
        moduleB = module(course, "Collections", Module.STATUS_VISIBLE);
        moduleC = module(course, "Empty module", Module.STATUS_VISIBLE);
        moduleD = module(course, "Hidden module", Module.STATUS_HIDDEN);
        moduleE = module(otherCourse, "Streams", Module.STATUS_VISIBLE);

        enroll(student, course);
        enroll(otherStudent, otherCourse);
        enroll(brokeStudent, course);

        single = question(moduleA, "SINGLE_CHOICE", "Which keyword creates a subclass?");
        singleRight = option(single, "extends", true, 1);
        singleWrong = option(single, "implements", false, 0);

        multi = question(moduleA, "MULTIPLE_CHOICE", "Which are primitives?");
        multiRightOne = option(multi, "int", true, 0);
        multiRightTwo = option(multi, "boolean", true, 1);
        multiWrong = option(multi, "String", false, 2);

        trueFalse = question(moduleA, "TRUE_FALSE", "A String is immutable.");
        trueFalseRight = option(trueFalse, "True", true, 0);
        option(trueFalse, "False", false, 1);

        fillBlank = question(moduleA, "FILL_BLANK", "____ {{1}} runs on the {{2}} platform.",
                "{\"blanks\":[{\"index\":1,\"accepted\":[\"Java\"],\"caseSensitive\":false},"
                        + "{\"index\":2,\"accepted\":[\"Java\",\"JVM\"],\"caseSensitive\":true}]}",
                null, null);

        ordering = question(moduleA, "ORDERING", "Order the compilation steps.");
        orderingFirst = option(ordering, "Parse", true, 0);
        orderingSecond = option(ordering, "Compile", true, 1);
        orderingThird = option(ordering, "Run", true, 2);
        em.flush();
        ordering.setAnswerKey("{\"correctOrder\":[" + orderingFirst.getOptionId() + ","
                + orderingSecond.getOptionId() + "," + orderingThird.getOptionId() + "]}");

        matching = question(moduleA, "MATCHING", "Match each annotation to its use.",
                "{\"pairs\":[{\"left\":\"@Override\",\"right\":\"Overrides a method\"},"
                        + "{\"left\":\"@Deprecated\",\"right\":\"Marks old API\"}]}",
                null, null);

        essay = question(moduleA, "ESSAY", "Explain garbage collection.", null, RUBRIC, null);

        diagram = question(moduleA, "DIAGRAM", "Draw the order model.", null, RUBRIC,
                "{\"drawioXml\":" + JSON.writeValueAsString(DIAGRAM_XML) + "}");

        code = question(moduleA, "CODE", "Write a method that reverses a string.", null, RUBRIC, null);

        // A displayable asset of one question and a shared passage of another.
        em.persist(QuestionMedia.builder().question(single).mediaType("IMAGE")
                .url("/uploads/documents/class-diagram.png").altText("Class diagram").build());
        group = QuestionGroup.builder().course(course).module(moduleA).questionType("ESSAY")
                .title("Garbage collection").passageText("Read the passage about heap generations first.").build();
        em.persist(group);
        essay.setGroup(group);

        // Ineligible for practice, one reason each: never a draft, an archived question, a deleted
        // one, or a question generated from another student's private material.
        question(moduleA, "SINGLE_CHOICE", "Draft question").setStatus("DRAFT");
        question(moduleA, "SINGLE_CHOICE", "Archived question").setStatus("ARCHIVED");
        question(moduleA, "SINGLE_CHOICE", "Deleted question").setDeletedAt(Instant.now());
        question(moduleA, "SINGLE_CHOICE", "Private material question").setSourceDocumentId(999_999L);
        question(moduleA, "SINGLE_CHOICE", "Pending approval").setApprovalStatus("PENDING");

        moduleBQuestions = List.of(
                question(moduleB, "SINGLE_CHOICE", "B one"),
                question(moduleB, "SINGLE_CHOICE", "B two"),
                question(moduleB, "SINGLE_CHOICE", "B three"));
        for (Question question : moduleBQuestions) {
            option(question, "right", true, 0);
            option(question, "wrong", false, 1);
        }
        question(moduleD, "SINGLE_CHOICE", "Hidden module question");
        Question otherCourseQuestion = question(moduleE, "SINGLE_CHOICE", "Other course question");
        option(otherCourseQuestion, "right", true, 0);

        // Shared data the reset must never touch.
        exam = Exam.builder().course(course).module(moduleA).createdBy(manager).title("Midterm")
                .durationMinutes(45).isPractice(false).generationType("MANUAL")
                .maxScore(new BigDecimal("10.00")).status("PUBLISHED").build();
        em.persist(exam);
        examAttempt = ExamAttempt.builder().exam(exam).user(student)
                .startTime(Instant.now().minusSeconds(3600))
                .deadlineAt(Instant.now().plusSeconds(3600))
                .submittedAt(Instant.now()).status("COMPLETED")
                .autoSubmitted(false).build();
        em.persist(examAttempt);
        examAnswer = AttemptAnswer.builder().attempt(examAttempt).question(single).gradingStatus("AUTO")
                .weightSnapshot(BigDecimal.ONE).questionVersion(1).build();
        em.persist(examAnswer);

        notebookRow = StudentQuestionReview.builder().student(student).question(single)
                .status("WRONG_BOOKMARKED").bookmark(true).wrongCount(2)
                .lastPracticedAt(Instant.now()).build();
        em.persist(notebookRow);

        deck = Deck.builder().user(student).course(course).title("Java deck").isPublic(false)
                .createdAt(Instant.now()).updatedAt(Instant.now()).build();
        em.persist(deck);
        card = Flashcard.builder().deck(deck).frontText("front").backText("back").position(0)
                .createdAt(Instant.now()).build();
        em.persist(card);
        cardProgress = UserCardProgress.builder().user(student).card(card).isStarred(true)
                .status("LEARNING").wrongCount(1).build();
        em.persist(cardProgress);
        em.flush();
    }

    // ------------------------------------------------------------------ fixture helpers

    protected User account(String role) {
        User value = User.builder().email(UUID.randomUUID() + "@example.com").fullName(role)
                .passwordHash("test-hash").roleName(role).build();
        em.persist(value);
        return value;
    }

    protected Module module(Course owner, String title, String status) {
        Module value = Module.builder().course(owner).title(title).orderIndex(1).status(status).build();
        em.persist(value);
        return value;
    }

    protected void enroll(User who, Course where) {
        em.persist(Enrollment.builder().user(who).course(where).enrolledAt(Instant.now())
                .status(Enrollment.STATUS_ACTIVE).build());
    }

    protected Question question(Module module, String type, String content) {
        return question(module, type, content, null, null, null);
    }

    protected Question question(Module module, String type, String content, String answerKey,
                               String rubric, String metadata) {
        Question value = Question.builder().course(module.getCourse()).module(module).questionType(type)
                .content(content).answerKey(answerKey).essayGradingRubric(rubric).questionMetadata(metadata)
                .status("ACTIVE").approvalStatus("APPROVED").build();
        em.persist(value);
        return value;
    }

    protected AnswerOption option(Question question, String text, boolean correct, int order) {
        AnswerOption value = AnswerOption.builder().question(question).optionText(text).isCorrect(correct)
                .orderIndex(order).build();
        em.persist(value);
        return value;
    }

    /** A single explanation reply; the service reads the first item of the batch. */
    protected String explanationReply(String text) {
        return "{\"items\":[{\"questionId\":1,\"explanation\":" + quote(text) + "}]}";
    }

    /** A grading reply that gives every point of the one-criterion rubric. */
    protected String gradingReply(String feedback) {
        return "{\"criteria\":[{\"criterionId\":\"c1\",\"points\":1.00,\"feedback\":" + quote(feedback)
                + "}],\"overallFeedback\":" + quote("Good work overall.") + "}";
    }

    protected String quote(String value) {
        try {
            return JSON.writeValueAsString(value);
        } catch (Exception ex) {
            throw new IllegalStateException(ex);
        }
    }

    // ------------------------------------------------------------------ HTTP helpers

    protected UserPrincipal principal(User who) {
        return UserPrincipal.create(who);
    }

    /**
     * The {@code data} object of an already executed request. Assertions on numbers run through
     * Jackson so a {@code 0.0000} accuracy is compared as a number, not as a JSON string.
     */
    protected JsonNode data(ResultActions actions) throws Exception {
        return json.readTree(rawBody(actions)).path("data");
    }

    protected String rawBody(ResultActions actions) throws Exception {
        return actions.andReturn().getResponse().getContentAsString();
    }

    protected String message(ResultActions actions) throws Exception {
        return json.readTree(rawBody(actions)).path("message").asText();
    }

    /** True when a response field is absent or explicitly null. */
    protected boolean blank(JsonNode node) {
        return node == null || node.isMissingNode() || node.isNull();
    }

    protected ResultActions overview(User who, Long moduleId) throws Exception {
        return mvc.perform(get("/api/v1/student/modules/{moduleId}/practice/overview", moduleId)
                .with(user(principal(who))));
    }

    protected ResultActions startSession(User who, Long moduleId, String body) throws Exception {
        return mvc.perform(post("/api/v1/student/modules/{moduleId}/practice/sessions", moduleId)
                .with(user(principal(who)))
                .contentType(MediaType.APPLICATION_JSON)
                .content(body == null ? "{}" : body));
    }

    /** Starts (or resumes) the session of one module and returns the {@code data} object. */
    protected JsonNode sessionOf(User who, Long moduleId) throws Exception {
        String body = startSession(who, moduleId, "{}").andExpect(status().is2xxSuccessful())
                .andReturn().getResponse().getContentAsString();
        return json.readTree(body).path("data");
    }

    protected JsonNode resume(User who, long sessionId) throws Exception {
        String body = mvc.perform(get("/api/v1/student/practice/sessions/{sessionId}", sessionId)
                        .with(user(principal(who))))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return json.readTree(body).path("data");
    }

    protected long sessionQuestionIdOf(JsonNode session, long questionId) {
        for (JsonNode row : session.path("questions")) {
            if (row.path("questionId").asLong() == questionId) {
                return row.path("sessionQuestionId").asLong();
            }
        }
        throw new AssertionError("question " + questionId + " is not in this practice session");
    }

    protected ResultActions submit(User who, long sessionId, long sessionQuestionId, String body) throws Exception {
        return mvc.perform(post("/api/v1/student/practice/sessions/{sessionId}/questions/{sessionQuestionId}/answers",
                        sessionId, sessionQuestionId)
                .with(user(principal(who)))
                .contentType(MediaType.APPLICATION_JSON)
                .content(body));
    }

    protected ResultActions history(User who, long sessionId, long sessionQuestionId) throws Exception {
        return mvc.perform(get("/api/v1/student/practice/sessions/{sessionId}/questions/{sessionQuestionId}/answers",
                        sessionId, sessionQuestionId)
                .with(user(principal(who))));
    }

    protected ResultActions questionView(User who, long sessionId, long sessionQuestionId) throws Exception {
        return mvc.perform(get("/api/v1/student/practice/sessions/{sessionId}/questions/{sessionQuestionId}",
                        sessionId, sessionQuestionId)
                .with(user(principal(who))));
    }

    /** MP-04 (batch): several questions of one session in one call. */
    protected ResultActions questions(User who, long sessionId, String ids) throws Exception {
        org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder request =
                get("/api/v1/student/practice/sessions/{sessionId}/questions", sessionId)
                        .with(user(principal(who)));
        if (ids != null) {
            request = request.param("ids", ids);
        }
        return mvc.perform(request);
    }

    /** MP-08 with {@code ?includeQuestions=true}: the result with every MP-04 body attached. */
    protected ResultActions resultIncludingQuestions(User who, long sessionId) throws Exception {
        return mvc.perform(get("/api/v1/student/practice/sessions/{sessionId}/result", sessionId)
                .with(user(principal(who)))
                .param("includeQuestions", "true"));
    }

    /** Submits an answer and returns the {@code data} object. */
    protected JsonNode answer(User who, long sessionId, long sessionQuestionId, String body) throws Exception {
        String content = submit(who, sessionId, sessionQuestionId, body)
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return json.readTree(content).path("data");
    }

    protected ResultActions complete(User who, long sessionId) throws Exception {
        return mvc.perform(post("/api/v1/student/practice/sessions/{sessionId}/complete", sessionId)
                .with(user(principal(who))));
    }

    protected ResultActions result(User who, long sessionId) throws Exception {
        return mvc.perform(get("/api/v1/student/practice/sessions/{sessionId}/result", sessionId)
                .with(user(principal(who))));
    }

    protected ResultActions reviewQuestions(User who, Long moduleId, int page, int size) throws Exception {
        return mvc.perform(get("/api/v1/student/modules/{moduleId}/practice/review-questions", moduleId)
                .with(user(principal(who)))
                .param("page", String.valueOf(page))
                .param("size", String.valueOf(size)));
    }

    protected ResultActions reset(User who, Long moduleId) throws Exception {
        return mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                .delete("/api/v1/student/modules/{moduleId}/practice/progress", moduleId)
                .with(user(principal(who))));
    }

    protected ResultActions explain(User who, long questionId, String body) throws Exception {
        return mvc.perform(post("/api/v1/student/practice/questions/{questionId}/explanation", questionId)
                .with(user(principal(who)))
                .contentType(MediaType.APPLICATION_JSON)
                .content(body));
    }

    // ------------------------------------------------------------------ database helpers

    protected long count(String jpql) {
        return ((Number) em.createQuery(jpql).getSingleResult()).longValue();
    }
}
