package com.examprep.controllers.student;

import com.examprep.entities.*;
import com.examprep.entities.Module;
import com.examprep.services.student.PersonalizationService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.*;
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
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.concurrent.ConcurrentLinkedDeque;

import static com.examprep.controllers.student.Fixtures.as;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** AI-01..04 against H2 and a local fake Gemini endpoint; background steps are driven by hand. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class PersonalizationApiIntegrationTest {
    static final ObjectMapper JSON = new ObjectMapper();
    static final HttpServer PROVIDER;
    static final Deque<String> REPLIES = new ConcurrentLinkedDeque<>();
    static final List<String> REQUESTS = Collections.synchronizedList(new ArrayList<>());
    static volatile int providerStatus = 200;
    static volatile long providerDelayMillis = 0;

    static {
        try {
            PROVIDER = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            PROVIDER.setExecutor(java.util.concurrent.Executors.newCachedThreadPool());
            PROVIDER.createContext("/v1beta/models/", exchange -> {
                REQUESTS.add(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
                if (providerDelayMillis > 0) try { Thread.sleep(providerDelayMillis); } catch (InterruptedException ignored) { }
                String reply = Objects.requireNonNullElse(REPLIES.poll(), "{}");
                byte[] bytes = JSON.writeValueAsBytes(Map.of(
                        "candidates", List.of(Map.of("content", Map.of("parts", List.of(Map.of("text", reply))))),
                        "usageMetadata", Map.of("promptTokenCount", 300, "candidatesTokenCount", 100)));
                exchange.getResponseHeaders().set("Content-Type", "application/json");
                exchange.sendResponseHeaders(providerStatus, bytes.length);
                exchange.getResponseBody().write(bytes);
                exchange.close();
            });
            PROVIDER.start();
        } catch (java.io.IOException ex) { throw new ExceptionInInitializerError(ex); }
    }

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        registry.add("app.ai.api-key", () -> "local-fake-provider-key");
        registry.add("app.ai.model", () -> "fake-model");
        registry.add("app.ai.base-url", () -> "http://127.0.0.1:" + PROVIDER.getAddress().getPort() + "/v1beta");
        registry.add("app.student-ai.grading-threads", () -> 0);
        registry.add("app.student-ai.sweep-ms", () -> 3_600_000);
        registry.add("app.student-ai.free-daily-tokens", () -> 20_000);
        registry.add("app.personalization.sweep-ms", () -> 3_600_000);
        registry.add("app.personalization.weakness-timeout-ms", () -> 1_500);
    }

    @AfterAll static void stop() { PROVIDER.stop(0); }

    @Autowired MockMvc mvc;
    @Autowired EntityManager em;
    @Autowired ObjectMapper json;
    @Autowired DataSource dataSource;
    @Autowired PersonalizationService personalization;
    Fixtures f;
    User student, other, manager;
    Course course;
    Module weak, strong;
    List<Question> weakQs = new ArrayList<>(), strongQs = new ArrayList<>();

    @BeforeEach void setUp() throws Exception {
        try (Connection c = dataSource.getConnection()) { Fixtures.aliasAdvisoryLock(c); }
        REPLIES.clear(); REQUESTS.clear(); providerStatus = 200; providerDelayMillis = 0;
        f = new Fixtures(em);
        manager = f.account(User.ROLE_COURSE_MANAGER);
        student = f.account(User.ROLE_STUDENT);
        other = f.account(User.ROLE_STUDENT);
        course = f.course(manager);
        f.enroll(student, course);
        f.enroll(other, course);
        weak = f.module(course, "Polymorphism");
        strong = f.module(course, "Data Types");
        for (int i = 0; i < 8; i++) weakQs.add(f.question(course, weak, i < 4 ? "HARD" : "MEDIUM"));
        for (int i = 0; i < 8; i++) strongQs.add(f.question(course, strong, "EASY"));
        em.flush();
    }

    /** n finished attempts: weak module answered wrong, strong module right; the last one submitted at {@code at}. */
    void history(User who, int attempts, Instant at) {
        Exam exam = f.exam(course, weak, manager, "EXAM");
        for (int i = 0; i < attempts; i++) {
            ExamAttempt a = f.finishedAttempt(exam, who, at.minus(attempts - 1 - i, ChronoUnit.HOURS), "5");
            f.answer(a, weakQs.get(i % 8), false);
            f.answer(a, weakQs.get((i + 1) % 8), i % 4 == 0);
            f.answer(a, strongQs.get(i % 8), true);
        }
        em.flush();
    }

    // ------------------------------------------------------------------ AI-01 / AI-02

    @Test void smartPracticeCompletesWithOnlyCandidateIds() throws Exception {
        history(student, 5, Instant.now());
        JsonNode started = data(smart(student, "{\"courseId\":" + course.getCourseId() + ",\"questionCount\":10}")
                .andExpect(status().isAccepted()).andExpect(jsonPath("$.message").value("Generating smart practice")));
        String jobId = started.path("jobId").asText();
        assertTrue(jobId.startsWith("sp-"));
        assertEquals("PROCESSING", started.path("status").asText());
        assertEquals(5, started.path("analysis").path("totalAttempts").asInt());
        assertEquals(weak.getModuleId(), started.path("analysis").path("weakCategories").get(0).path("categoryId").asLong());
        assertEquals("Polymorphism", started.path("analysis").path("weakCategories").get(0).path("name").asText());
        assertEquals(strong.getModuleId(), started.path("analysis").path("strongCategories").get(0).path("categoryId").asLong());
        assertEquals(100, started.path("analysis").path("strongCategories").get(0).path("accuracy").asInt());

        poll(student, jobId).andExpect(status().isOk()).andExpect(header().string("Retry-After", "2"))
                .andExpect(jsonPath("$.data.status").value("PROCESSING"));

        long a = weakQs.get(0).getQuestionId(), b = weakQs.get(1).getQuestionId();
        REPLIES.add("{\"questionIds\":[" + a + "," + b + "," + a + "," + Long.MAX_VALUE + "]}");
        personalization.runSmartPractice(Long.parseLong(jobId.substring(3)));

        JsonNode done = data(poll(student, jobId).andExpect(status().isOk()).andExpect(header().doesNotExist("Retry-After")));
        assertEquals("COMPLETED", done.path("status").asText());
        assertEquals(10, done.path("questionCount").asInt());
        assertTrue(done.path("focusAreas").get(0).asText().startsWith("Polymorphism ("));
        assertFalse(done.path("estimatedDifficulty").asText().isBlank());
        Exam exam = em.find(Exam.class, done.path("examId").asLong());
        assertEquals("SMART_PRACTICE", exam.getMode());
        List<Long> drawn = em.createQuery("select eq.question.questionId from ExamQuestion eq where eq.exam = :e", Long.class)
                .setParameter("e", exam).getResultList();
        assertEquals(10, new HashSet<>(drawn).size());
        assertTrue(drawn.contains(a) && drawn.contains(b));
        assertFalse(drawn.contains(Long.MAX_VALUE));
        long weakCount = drawn.stream().filter(id -> weakQs.stream().anyMatch(q -> q.getQuestionId().equals(id))).count();
        assertTrue(weakCount >= 7, "about 70% from the weak module, got " + weakCount);
        AiUsageLog log = onlyLog("SMART_PRACTICE");
        assertEquals("SUCCESS", log.getStatus());
        assertEquals(0, log.getReservedTokens());
        assertFalse(REQUESTS.get(0).contains(student.getEmail()));
    }

    @Test void insufficientData422() throws Exception {
        history(student, 4, Instant.now());
        smart(student, "{\"courseId\":" + course.getCourseId() + "}")
                .andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.data.code").value("INSUFFICIENT_DATA"));
    }

    @Test void quotaExceeded429() throws Exception {
        history(student, 5, Instant.now());
        em.persist(AiUsageLog.builder().user(student).purpose("EXPLANATION").status("SUCCESS").inputTokens(19_990).outputTokens(0)
                .billingSource("FREE").build());
        em.flush();
        smart(student, "{\"courseId\":" + course.getCourseId() + "}")
                .andExpect(status().isTooManyRequests()).andExpect(jsonPath("$.data.code").value("QUOTA_EXCEEDED"))
                .andExpect(jsonPath("$.data.estimatedTokens").isNumber())
                .andExpect(jsonPath("$.data.availableTokens").value(10))
                .andExpect(jsonPath("$.data.quota.freeRemaining").value(10));
    }

    @Test void aiFailureFailsJobAndRefunds() throws Exception {
        history(student, 5, Instant.now());
        String jobId = data(smart(student, "{\"courseId\":" + course.getCourseId() + ",\"questionCount\":10}")).path("jobId").asText();
        providerStatus = 500;
        personalization.runSmartPractice(Long.parseLong(jobId.substring(3)));
        poll(student, jobId).andExpect(jsonPath("$.data.status").value("FAILED")).andExpect(jsonPath("$.data.examId").value(org.hamcrest.Matchers.nullValue()));
        AiUsageLog log = onlyLog("SMART_PRACTICE");
        assertEquals("FAILED", log.getStatus());
        assertEquals(0, log.getReservedTokens());
    }

    @Test void expiredJobIsSwept() throws Exception {
        history(student, 5, Instant.now());
        String jobId = data(smart(student, "{\"courseId\":" + course.getCourseId() + ",\"questionCount\":10}")).path("jobId").asText();
        AiPersonalizationJob job = em.find(AiPersonalizationJob.class, Long.parseLong(jobId.substring(3)));
        job.setExpiresAt(Instant.now().minusSeconds(1));
        em.flush();
        personalization.sweepExpiredJobs();
        poll(student, jobId).andExpect(jsonPath("$.data.status").value("FAILED"));
        assertEquals("FAILED", onlyLog("SMART_PRACTICE").getStatus());
        // A late worker run must not resurrect it.
        REPLIES.add("{\"questionIds\":[]}");
        personalization.runSmartPractice(job.getJobId());
        poll(student, jobId).andExpect(jsonPath("$.data.status").value("FAILED"));
    }

    @Test void pollRules() throws Exception {
        history(student, 5, Instant.now());
        String jobId = data(smart(student, "{\"courseId\":" + course.getCourseId() + ",\"questionCount\":10}")).path("jobId").asText();
        poll(other, jobId).andExpect(status().isForbidden());
        poll(student, "sp-" + Long.MAX_VALUE).andExpect(status().isNotFound());
        poll(student, "abc").andExpect(status().isNotFound());
    }

    @Test void smartBoundsValidation400() throws Exception {
        String c = "\"courseId\":" + course.getCourseId();
        smart(student, "{" + c + ",\"questionCount\":9}").andExpect(status().isBadRequest());
        smart(student, "{" + c + ",\"questionCount\":31}").andExpect(status().isBadRequest());
        smart(student, "{" + c + ",\"durationMinutes\":9}").andExpect(status().isBadRequest());
        smart(student, "{" + c + ",\"durationMinutes\":61}").andExpect(status().isBadRequest());
        smart(student, "{}").andExpect(status().isBadRequest());
        User outsider = f.account(User.ROLE_STUDENT);
        smart(outsider, "{" + c + "}").andExpect(status().isForbidden());
    }

    // ------------------------------------------------------------------ AI-03

    String recommendationReply(long deckId, long examId) {
        return "{\"recommendations\":["
                + "{\"type\":\"EXAM\",\"refId\":" + examId + ",\"title\":\"x\",\"reason\":\"Practise exams\",\"priority\":\"MEDIUM\"},"
                + "{\"type\":\"FLASHCARD_DECK\",\"refId\":" + deckId + ",\"title\":\"ignored\",\"reason\":\"Review OOP words\",\"priority\":\"HIGH\"},"
                + "{\"type\":\"FLASHCARD_DECK\",\"refId\":" + Long.MAX_VALUE + ",\"title\":\"ghost\",\"reason\":\"r\",\"priority\":\"HIGH\"},"
                + "{\"type\":\"PODCAST\",\"refId\":null,\"title\":\"p\",\"reason\":\"r\",\"priority\":\"HIGH\"},"
                + "{\"type\":\"REVIEW_SESSION\",\"refId\":null,\"title\":\"Redo 10 wrong questions\",\"reason\":\"r\",\"priority\":\"HIGH\"},"
                + "{\"type\":\"WEAK_TOPIC\",\"refId\":" + weak.getModuleId() + ",\"title\":\"Polymorphism\",\"reason\":\"r\",\"priority\":\"LOW\"},"
                + "{\"type\":\"WEAK_TOPIC\",\"refId\":" + strong.getModuleId() + ",\"title\":\"Data\",\"reason\":\"r\",\"priority\":\"LOW\"},"
                + "{\"type\":\"REVIEW_SESSION\",\"refId\":null,\"title\":\"Again\",\"reason\":\"r\",\"priority\":\"MEDIUM\"}]}";
    }

    @Test void recommendationsDropUnknownRefIdsAndCapAtFive() throws Exception {
        history(student, 5, Instant.now().minusSeconds(60));
        Deck deck = Deck.builder().user(manager).course(course).title("OOP words").isPublic(false).build();
        em.persist(deck);
        Exam exam = f.exam(course, weak, manager, "EXAM");
        em.flush();
        REPLIES.add(recommendationReply(deck.getDeckId(), exam.getExamId()));
        JsonNode data = data(recommend(student).andExpect(status().isOk()));
        assertEquals("GENERATED", data.path("source").asText());
        JsonNode items = data.path("recommendations");
        assertEquals(5, items.size());
        assertEquals("HIGH", items.get(0).path("priority").asText());
        assertEquals("OOP words", items.get(0).path("title").asText());
        for (JsonNode item : items) {
            assertNotEquals("PODCAST", item.path("type").asText());
            assertNotEquals(Long.MAX_VALUE, item.path("refId").asLong());
        }
        assertEquals("Polymorphism", data.path("weaknesses").get(0).path("name").asText());
        assertEquals("HIGH", data.path("weaknesses").get(0).path("priority").asText());
        assertEquals(100, data.path("strengths").get(0).path("accuracy").asInt());
        int readiness = data.path("overallReadiness").asInt();
        assertTrue(readiness > 0 && readiness < 100, "readiness " + readiness);
        assertTrue(data.path("quota").has("freeRemaining"));
        assertEquals("SUCCESS", onlyLog("RECOMMENDATION").getStatus());
    }

    @Test void recommendationsAreCachedFreeAndClearedBySubmission() throws Exception {
        history(student, 5, Instant.now().minusSeconds(60));
        REPLIES.add("{\"recommendations\":[]}");
        recommend(student).andExpect(jsonPath("$.data.source").value("GENERATED"));
        recommend(student).andExpect(jsonPath("$.data.source").value("CACHED"));
        assertEquals(1, REQUESTS.size());
        assertEquals(1L, em.createQuery("select count(l) from AiUsageLog l", Long.class).getSingleResult());
        history(student, 1, Instant.now().plusSeconds(5));
        REPLIES.add("{\"recommendations\":[]}");
        recommend(student).andExpect(jsonPath("$.data.source").value("GENERATED"));
        assertEquals(2, REQUESTS.size());
    }

    @Test void fewAttemptsGivesEmptyListWithoutAi() throws Exception {
        history(student, 2, Instant.now());
        recommend(student).andExpect(status().isOk()).andExpect(jsonPath("$.data.recommendations.length()").value(0))
                .andExpect(jsonPath("$.data.message").isNotEmpty());
        assertEquals(0, REQUESTS.size());
        assertEquals(0L, em.createQuery("select count(l) from AiUsageLog l", Long.class).getSingleResult());
        recommend(f.account(User.ROLE_STUDENT)).andExpect(status().isForbidden());
    }

    @Test void recommendationsQuota429() throws Exception {
        history(student, 5, Instant.now());
        em.persist(AiUsageLog.builder().user(student).purpose("EXPLANATION").status("SUCCESS").inputTokens(20_000).outputTokens(0)
                .billingSource("FREE").build());
        em.flush();
        recommend(student).andExpect(status().isTooManyRequests()).andExpect(jsonPath("$.data.code").value("QUOTA_EXCEEDED"));
    }

    // ------------------------------------------------------------------ AI-04

    /** n attempts with 4 wrong answers in the weak module and one right answer in the strong one. */
    void wrongHistory(int attempts) {
        Exam exam = f.exam(course, weak, manager, "EXAM");
        for (int i = 0; i < attempts; i++) {
            ExamAttempt a = f.finishedAttempt(exam, student, Instant.now().minus(i + 1, ChronoUnit.HOURS), "2");
            for (int k = 0; k < 4; k++) f.answer(a, weakQs.get((i + k) % 8), false);
            f.answer(a, strongQs.get(i % 8), true);
        }
        em.flush();
    }

    String weaknessReply() {
        return "{\"summary\":\"Bạn yếu Polymorphism.\",\"categories\":[{\"categoryId\":" + weak.getModuleId() + ",\"commonMistakes\":["
                + "{\"pattern\":\"override vs overload\",\"frequency\":8,\"suggestion\":\"Ôn thẻ 5\"},"
                + "{\"pattern\":\"dispatch\",\"frequency\":0,\"suggestion\":\"s\"},"
                + "{\"pattern\":\"p3\",\"frequency\":2,\"suggestion\":\"s\"},"
                + "{\"pattern\":\"p4\",\"frequency\":1,\"suggestion\":\"s\"}]},"
                + "{\"categoryId\":" + Long.MAX_VALUE + ",\"commonMistakes\":[{\"pattern\":\"ghost\",\"frequency\":1,\"suggestion\":\"s\"}]}],"
                + "\"actionPlan\":[\"1\",\"2\",\"3\",\"4\",\"5\",\"6\"]}";
    }

    @Test void weaknessReportShapeAndCachePerPeriod() throws Exception {
        wrongHistory(6);
        REPLIES.add(weaknessReply());
        JsonNode data = data(weakness(student, "{\"courseId\":" + course.getCourseId() + "}").andExpect(status().isOk()));
        assertEquals("GENERATED", data.path("source").asText());
        assertEquals("LAST_30_DAYS", data.path("period").asText());
        assertEquals("Bạn yếu Polymorphism.", data.path("summary").asText());
        JsonNode first = data.path("categoryBreakdown").get(0);
        assertEquals(weak.getModuleId(), first.path("categoryId").asLong());
        assertEquals(24, first.path("totalQuestions").asInt());
        assertEquals(0, first.path("accuracy").asInt());
        assertEquals(3, first.path("commonMistakes").size());
        assertEquals(1, first.path("commonMistakes").get(1).path("frequency").asInt());
        assertEquals(0, data.path("categoryBreakdown").get(1).path("commonMistakes").size());
        assertEquals(5, data.path("actionPlan").size());
        assertEquals("SINGLE_CHOICE", data.path("questionTypeBreakdown").get(0).path("questionType").asText());
        assertTrue(REQUESTS.get(0).contains(weakQs.get(0).getContent()));

        REPLIES.add(weaknessReply());
        weakness(student, "{\"courseId\":" + course.getCourseId() + ",\"period\":\"ALL_TIME\"}").andExpect(jsonPath("$.data.source").value("GENERATED"));
        weakness(student, "{\"courseId\":" + course.getCourseId() + ",\"period\":\"LAST_30_DAYS\"}").andExpect(jsonPath("$.data.source").value("CACHED"));
        assertEquals(2, REQUESTS.size());
    }

    @Test void weaknessInsufficient422() throws Exception {
        history(student, 5, Instant.now());
        weakness(student, "{\"courseId\":" + course.getCourseId() + "}")
                .andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.data.code").value("INSUFFICIENT_DATA"));
    }

    @Test void weaknessTimeoutIs500AndRefunds() throws Exception {
        wrongHistory(6);
        providerDelayMillis = 3_000;
        REPLIES.add(weaknessReply());
        weakness(student, "{\"courseId\":" + course.getCourseId() + "}")
                .andExpect(status().isInternalServerError()).andExpect(jsonPath("$.data.code").value("AI_TIMEOUT"));
        AiUsageLog log = onlyLog("WEAKNESS_REPORT");
        assertEquals("TIMEOUT", log.getStatus());
        assertEquals(0, log.getReservedTokens());
    }

    @Test void weaknessRejectsShortActionPlanAndBadPeriod() throws Exception {
        wrongHistory(6);
        weakness(student, "{\"courseId\":" + course.getCourseId() + ",\"period\":\"LAST_YEAR\"}").andExpect(status().isBadRequest());
        REPLIES.add("{\"summary\":\"s\",\"categories\":[],\"actionPlan\":[\"only one\"]}");
        weakness(student, "{\"courseId\":" + course.getCourseId() + "}").andExpect(status().isBadGateway());
        assertEquals("FAILED", onlyLog("WEAKNESS_REPORT").getStatus());
    }

    ResultActions recommend(User actor) throws Exception {
        return mvc.perform(get("/api/v1/student/ai/recommendations").param("courseId", course.getCourseId().toString()).with(as(actor)));
    }

    ResultActions weakness(User actor, String body) throws Exception {
        return mvc.perform(post("/api/v1/student/ai/weakness-report").with(as(actor)).contentType(MediaType.APPLICATION_JSON).content(body));
    }

    // ------------------------------------------------------------------ helpers

    ResultActions smart(User actor, String body) throws Exception {
        return mvc.perform(post("/api/v1/student/ai/smart-practice").with(as(actor)).contentType(MediaType.APPLICATION_JSON).content(body));
    }

    ResultActions poll(User actor, String jobId) throws Exception {
        return mvc.perform(get("/api/v1/student/ai/smart-practice/" + jobId).with(as(actor)));
    }

    AiUsageLog onlyLog(String purpose) {
        em.flush();
        em.clear();
        return em.createQuery("select l from AiUsageLog l where l.purpose = :p", AiUsageLog.class).setParameter("p", purpose).getSingleResult();
    }

    JsonNode data(ResultActions result) throws Exception {
        return json.readTree(result.andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8)).path("data");
    }
}
