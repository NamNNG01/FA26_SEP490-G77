package com.examprep.controllers;

import com.examprep.entities.*;
import com.examprep.entities.Module;
import com.examprep.security.UserPrincipal;
import com.examprep.services.AttemptPaperFactory;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import javax.sql.DataSource;
import java.math.BigDecimal;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.concurrent.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Verifies single-flight locking for SE-03 and MP-10: two concurrent deep-explanation requests for
 * the same submitted answer call the AI provider once and charge tokens once.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
public class DeepExplanationConcurrencyTest {

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final HttpServer PROVIDER;
    private static final ExecutorService WORKERS = Executors.newCachedThreadPool();
    private static final List<String> REQUESTS = Collections.synchronizedList(new ArrayList<>());

    static {
        try {
            PROVIDER = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            PROVIDER.setExecutor(WORKERS);
            PROVIDER.createContext("/v1beta/models/", exchange -> {
                REQUESTS.add(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
                try {
                    Thread.sleep(150);
                } catch (InterruptedException ignored) {
                    Thread.currentThread().interrupt();
                }
                String reply = JSON.writeValueAsString(Map.of(
                        "explanation", "Single-flight deep explanation."));
                byte[] bytes = JSON.writeValueAsBytes(Map.of(
                        "candidates", List.of(Map.of("content", Map.of("parts", List.of(Map.of("text", reply))))),
                        "usageMetadata", Map.of("promptTokenCount", 120, "candidatesTokenCount", 80)));
                exchange.getResponseHeaders().set("Content-Type", "application/json");
                exchange.sendResponseHeaders(200, bytes.length);
                exchange.getResponseBody().write(bytes);
                exchange.close();
            });
            PROVIDER.start();
            Runtime.getRuntime().addShutdownHook(new Thread(() -> {
                PROVIDER.stop(0);
                WORKERS.shutdownNow();
            }, "deep-concurrency-fake-ai-shutdown"));
        } catch (java.io.IOException ex) {
            throw new ExceptionInInitializerError(ex);
        }
    }

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        registry.add("app.ai.api-key", () -> "local-fake-provider-key");
        registry.add("app.ai.model", () -> "fake-model");
        registry.add("app.ai.base-url", () -> "http://127.0.0.1:" + PROVIDER.getAddress().getPort() + "/v1beta");
        registry.add("app.student-ai.grading-threads", () -> 0);
        registry.add("app.student-ai.sweep-ms", () -> 3_600_000);
        registry.add("app.student-ai.free-monthly-tokens", () -> 10_000);
    }

    public static Integer advisoryLock(Long key) {
        return 0;
    }

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired EntityManager em;
    @Autowired PlatformTransactionManager txManager;
    @Autowired DataSource dataSource;
    @Autowired AttemptPaperFactory paperFactory;

    private TransactionTemplate tx;

    @BeforeEach
    void initDb() throws Exception {
        try (Connection c = dataSource.getConnection()) {
            c.createStatement().execute("CREATE ALIAS IF NOT EXISTS pg_advisory_xact_lock FOR '"
                    + DeepExplanationConcurrencyTest.class.getName() + ".advisoryLock'");
        }
        REQUESTS.clear();
        tx = new TransactionTemplate(txManager);
    }

    @Test
    void se03ConcurrentRequestsCallAiOnceAndChargeOnce() throws Exception {
        record Fixture(User student, Long attemptId, Long questionId) { }
        Fixture fx = tx.execute(status -> {
            User student = User.builder().email(UUID.randomUUID() + "@example.com").fullName("S")
                    .passwordHash("x").roleName(User.ROLE_STUDENT).build();
            User manager = User.builder().email(UUID.randomUUID() + "@example.com").fullName("M")
                    .passwordHash("x").roleName(User.ROLE_COURSE_MANAGER).build();
            em.persist(student);
            em.persist(manager);
            Category cat = Category.builder().name("C-" + UUID.randomUUID()).slug("c-" + UUID.randomUUID()).build();
            em.persist(cat);
            Course course = Course.builder().categoryId(cat.getCategoryId()).category(cat).manager(manager)
                    .title("Java").slug("j-" + UUID.randomUUID()).isPublished(true).build();
            em.persist(course);
            Module module = Module.builder().course(course).title("M1").orderIndex(1).build();
            em.persist(module);
            Exam exam = Exam.builder().course(course).module(module).createdBy(manager).title("Midterm")
                    .durationMinutes(30).isPractice(false).generationType("MANUAL")
                    .maxScore(new BigDecimal("10")).status("PUBLISHED").build();
            em.persist(exam);
            ExamAttempt attempt = ExamAttempt.builder().exam(exam).user(student)
                    .startTime(Instant.now().minus(1, ChronoUnit.HOURS)).deadlineAt(Instant.now())
                    .submittedAt(Instant.now()).status("SUBMITTED")
                    .examSnapshot("{\"maxScore\":10,\"title\":\"Midterm\"}").totalScore(BigDecimal.ZERO).build();
            em.persist(attempt);
            Question q = Question.builder().course(course).module(module).questionType("SINGLE_CHOICE")
                    .difficulty("EASY").content("Keyword for inheritance?").status("ACTIVE")
                    .approvalStatus("APPROVED").build();
            em.persist(q);
            em.persist(AttemptAnswer.builder().attempt(attempt).question(q).weightSnapshot(BigDecimal.ONE)
                    .displaySnapshot("{\"content\":\"Keyword for inheritance?\",\"options\":[{\"optionId\":1,\"optionText\":\"implements\"},{\"optionId\":2,\"optionText\":\"extends\"}]}")
                    .keySnapshot("{\"correctOptionIds\":[2]}").response("{\"selectedOptionIds\":[1]}")
                    .gradingStatus("AUTO").questionVersion(1).scoreEarned(BigDecimal.ZERO).build());
            return new Fixture(student, attempt.getAttemptId(), q.getQuestionId());
        });

        String path = "/api/v1/student/attempts/" + fx.attemptId() + "/questions/" + fx.questionId() + "/deep-explanation";
        List<JsonNode> responses = runConcurrently(2, () -> {
            MvcResult res = mvc.perform(post(path).with(user(UserPrincipal.create(fx.student())))
                            .contentType(MediaType.APPLICATION_JSON).content("{}"))
                    .andExpect(status().isOk())
                    .andReturn();
            return json.readTree(res.getResponse().getContentAsString()).path("data");
        });

        assertEquals(1, REQUESTS.size(), "Concurrent SE-03 calls must only call AI once");
        Long logCount = tx.execute(s -> em.createQuery(
                        "SELECT COUNT(l) FROM AiUsageLog l WHERE l.user.userId = :uid AND l.purpose = 'EXPLANATION'", Long.class)
                .setParameter("uid", fx.student().getUserId()).getSingleResult());
        assertEquals(1L, logCount, "Concurrent SE-03 calls must only bill once");
        assertEquals("Single-flight deep explanation.", responses.get(0).path("explanation").asText());
        assertEquals("Single-flight deep explanation.", responses.get(1).path("explanation").asText());
        List<Integer> tokens = responses.stream().map(r -> r.path("tokensUsed").asInt()).sorted().toList();
        assertEquals(0, tokens.get(0));
        assertEquals(200, tokens.get(1));
    }

    @Test
    void mp10ConcurrentRequestsCallAiOnceAndChargeOnce() throws Exception {
        record Fixture(User student, Long sessionId, Long sessionQuestionId, Long questionId, Long practiceAnswerId) { }
        Fixture fx = tx.execute(status -> {
            User student = User.builder().email(UUID.randomUUID() + "@example.com").fullName("S")
                    .passwordHash("x").roleName(User.ROLE_STUDENT).build();
            User manager = User.builder().email(UUID.randomUUID() + "@example.com").fullName("M")
                    .passwordHash("x").roleName(User.ROLE_COURSE_MANAGER).build();
            em.persist(student);
            em.persist(manager);
            Category cat = Category.builder().name("C-" + UUID.randomUUID()).slug("c-" + UUID.randomUUID()).build();
            em.persist(cat);
            Course course = Course.builder().categoryId(cat.getCategoryId()).category(cat).manager(manager)
                    .title("Java").slug("j-" + UUID.randomUUID()).isPublished(true).build();
            em.persist(course);
            em.persist(Enrollment.builder().course(course).user(student).enrolledAt(Instant.now())
                    .status(Enrollment.STATUS_ACTIVE).build());
            Module module = Module.builder().course(course).title("M1").orderIndex(1).build();
            em.persist(module);
            Question q = Question.builder().course(course).module(module).questionType("SINGLE_CHOICE")
                    .difficulty("EASY").content("Keyword for inheritance?").status("ACTIVE")
                    .approvalStatus("APPROVED").build();
            em.persist(q);
            QuestionPracticeSession session = QuestionPracticeSession.builder()
                    .user(student).course(course).module(module).questionCount(1).build();
            em.persist(session);
            QuestionPracticeSessionQuestion sq = QuestionPracticeSessionQuestion.builder()
                    .session(session).question(q).orderIndex(0).scoringVersion(1)
                    .displaySnapshot("{\"questionId\":" + q.getQuestionId() + ",\"orderIndex\":0,\"questionType\":\"SINGLE_CHOICE\",\"content\":\"Keyword for inheritance?\",\"options\":[{\"optionId\":1,\"optionText\":\"implements\"},{\"optionId\":2,\"optionText\":\"extends\"}]}")
                    .keySnapshot("{\"correctOptionIds\":[2]}").build();
            em.persist(sq);
            QuestionPracticeAnswer ans = QuestionPracticeAnswer.builder()
                    .sessionQuestion(sq).attemptNumber(1).response("{\"selectedOptionIds\":[1]}")
                    .gradingStatus("AUTO").isCorrect(false).scoreEarned(BigDecimal.ZERO).build();
            em.persist(ans);
            return new Fixture(student, session.getSessionId(), sq.getSessionQuestionId(),
                    q.getQuestionId(), ans.getPracticeAnswerId());
        });

        String path = "/api/v1/student/practice/questions/" + fx.questionId() + "/deep-explanation";
        String body = "{\"sessionId\":" + fx.sessionId() + ",\"sessionQuestionId\":" + fx.sessionQuestionId()
                + ",\"practiceAnswerId\":" + fx.practiceAnswerId() + "}";
        List<JsonNode> responses = runConcurrently(2, () -> {
            MvcResult res = mvc.perform(post(path).with(user(UserPrincipal.create(fx.student())))
                            .contentType(MediaType.APPLICATION_JSON).content(body))
                    .andExpect(status().isOk())
                    .andReturn();
            return json.readTree(res.getResponse().getContentAsString()).path("data");
        });

        assertEquals(1, REQUESTS.size(), "Concurrent MP-10 calls must only call AI once");
        Long logCount = tx.execute(s -> em.createQuery(
                        "SELECT COUNT(l) FROM AiUsageLog l WHERE l.user.userId = :uid AND l.purpose = 'EXPLANATION'", Long.class)
                .setParameter("uid", fx.student().getUserId()).getSingleResult());
        assertEquals(1L, logCount, "Concurrent MP-10 calls must only bill once");
        assertEquals("Single-flight deep explanation.", responses.get(0).path("explanation").asText());
        assertEquals("Single-flight deep explanation.", responses.get(1).path("explanation").asText());
        List<Integer> tokens = responses.stream().map(r -> r.path("tokensUsed").asInt()).sorted().toList();
        assertEquals(0, tokens.get(0));
        assertEquals(200, tokens.get(1));
    }

    private <T> List<T> runConcurrently(int count, Callable<T> task) throws Exception {
        ExecutorService pool = Executors.newFixedThreadPool(count);
        CountDownLatch ready = new CountDownLatch(count);
        CountDownLatch start = new CountDownLatch(1);
        try {
            List<Future<T>> futures = new ArrayList<>();
            for (int i = 0; i < count; i++) {
                futures.add(pool.submit(() -> {
                    ready.countDown();
                    start.await(5, TimeUnit.SECONDS);
                    return task.call();
                }));
            }
            assertTrue(ready.await(5, TimeUnit.SECONDS));
            start.countDown();
            List<T> out = new ArrayList<>(count);
            for (Future<T> future : futures) {
                out.add(future.get(15, TimeUnit.SECONDS));
            }
            return out;
        } finally {
            pool.shutdownNow();
        }
    }
}
