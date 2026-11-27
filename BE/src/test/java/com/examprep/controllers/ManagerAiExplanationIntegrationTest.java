package com.examprep.controllers;

import com.examprep.entities.*;
import com.examprep.repositories.ManagerExplanationJobItemRepository;
import com.examprep.repositories.ManagerExplanationJobRepository;
import com.examprep.repositories.QuestionRepository;
import com.examprep.security.UserPrincipal;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.AfterAll;
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

import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.ConcurrentLinkedDeque;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import static org.hamcrest.Matchers.containsString;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * Integration tests for AI-04 (manager background explanations), Q-01 ids filter + status fields,
 * manager notification delivery, and the Draft -> Published explanation gate.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
public class ManagerAiExplanationIntegrationTest {

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final HttpServer PROVIDER;
    private static final ExecutorService WORKERS = Executors.newCachedThreadPool();
    private static final Deque<String> REPLIES = new ConcurrentLinkedDeque<>();
    private static final List<String> REQUESTS = Collections.synchronizedList(new ArrayList<>());
    private static volatile int providerStatus = 200;

    static {
        try {
            PROVIDER = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            PROVIDER.setExecutor(WORKERS);
            PROVIDER.createContext("/v1beta/models/", exchange -> {
                REQUESTS.add(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
                String reply = Objects.requireNonNullElse(REPLIES.poll(), "{}");
                byte[] bytes = JSON.writeValueAsBytes(Map.of(
                        "candidates", List.of(Map.of("content", Map.of("parts", List.of(Map.of("text", reply))))),
                        "usageMetadata", Map.of("promptTokenCount", 100, "candidatesTokenCount", 50)));
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
    static void properties(DynamicPropertyRegistry registry) {
        registry.add("app.ai.api-key", () -> "local-fake-provider-key");
        registry.add("app.ai.model", () -> "fake-model");
        registry.add("app.ai.base-url", () -> "http://127.0.0.1:" + PROVIDER.getAddress().getPort() + "/v1beta");
        registry.add("app.question-ai.explanation-sweep-ms", () -> 3_600_000);
    }

    @AfterAll
    static void stopProvider() {
        PROVIDER.stop(0);
        WORKERS.shutdownNow();
    }

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired EntityManager em;
    @Autowired PlatformTransactionManager txManager;
    @Autowired QuestionRepository questionRepo;
    @Autowired ManagerExplanationJobRepository jobRepo;
    @Autowired ManagerExplanationJobItemRepository jobItemRepo;

    private TransactionTemplate tx;
    private User manager;
    private User foreignManager;
    private Course course;
    private com.examprep.entities.Module module;
    private Question blankQ1;
    private Question blankQ2;
    private Question explainedQ;

    @BeforeEach
    void setup() {
        REPLIES.clear();
        REQUESTS.clear();
        providerStatus = 200;
        tx = new TransactionTemplate(txManager);
        tx.executeWithoutResult(s -> {
            manager = User.builder().email(UUID.randomUUID() + "@example.com").fullName("Mgr").passwordHash("x")
                    .roleName(User.ROLE_COURSE_MANAGER).build();
            foreignManager = User.builder().email(UUID.randomUUID() + "@example.com").fullName("OtherMgr").passwordHash("x")
                    .roleName(User.ROLE_COURSE_MANAGER).build();
            em.persist(manager);
            em.persist(foreignManager);

            Category category = Category.builder().name("Cat-" + UUID.randomUUID()).slug("cat-" + UUID.randomUUID()).build();
            em.persist(category);

            course = Course.builder().manager(manager).category(category).categoryId(category.getCategoryId())
                    .title("Java Course").slug("java-" + UUID.randomUUID()).isPublished(true).build();
            em.persist(course);
            em.persist(CourseManager.builder().course(course).user(manager).build());

            module = com.examprep.entities.Module.builder().course(course).title("Mod 1").orderIndex(1).build();
            em.persist(module);

            blankQ1 = createChoiceQuestion("What does final mean in Java?", null);
            blankQ2 = createChoiceQuestion("What does static mean in Java?", null);
            explainedQ = createChoiceQuestion("What does super mean?", "Calls parent constructor or member.");
        });
    }

    @Test
    void ai04QueuesBlankSkipsExistingGeneratesInBackgroundAndNotifiesManager() throws Exception {
        // Unauthorized manager gets 403.
        mvc.perform(post("/api/v1/manager/questions/ai/explanations")
                        .with(user(UserPrincipal.create(foreignManager)))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of(
                                "questionIds", List.of(blankQ1.getQuestionId()),
                                "overwrite", false))))
                .andExpect(status().isForbidden());

        REPLIES.add(json.writeValueAsString(Map.of("items", List.of(
                Map.of("questionId", blankQ1.getQuestionId(), "explanation", "final prevents reassignment or overriding."),
                Map.of("questionId", blankQ2.getQuestionId(), "explanation", "static binds a member to the class.")))));

        MvcResult accepted = mvc.perform(post("/api/v1/manager/questions/ai/explanations")
                        .with(user(UserPrincipal.create(manager)))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of(
                                "questionIds", List.of(blankQ1.getQuestionId(), explainedQ.getQuestionId(), blankQ2.getQuestionId()),
                                "overwrite", false))))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.data.queuedCount").value(2))
                .andExpect(jsonPath("$.data.skippedCount").value(1))
                .andReturn();

        long jobId = json.readTree(accepted.getResponse().getContentAsString()).path("data").path("jobId").asLong();
        assertTrue(jobId > 0);

        // Wait for background worker to complete the job.
        awaitJobDone(jobId);

        Question reloaded1 = questionRepo.findById(blankQ1.getQuestionId()).orElseThrow();
        Question reloaded2 = questionRepo.findById(blankQ2.getQuestionId()).orElseThrow();
        assertEquals("final prevents reassignment or overriding.", reloaded1.getAiExplanation());
        assertEquals("AI", reloaded1.getAiExplanationSource());
        assertEquals(reloaded1.getScoringVersion(), reloaded1.getAiExplanationVersion());
        assertEquals("static binds a member to the class.", reloaded2.getAiExplanation());

        // Q-01 ids filter + hasExplanation + explanationStatus
        mvc.perform(get("/api/v1/manager/questions")
                        .param("ids", blankQ1.getQuestionId().toString(), blankQ2.getQuestionId().toString())
                        .with(user(UserPrincipal.create(manager))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalElements").value(2))
                .andExpect(jsonPath("$.data.content[0].hasExplanation").value(true))
                .andExpect(jsonPath("$.data.content[0].explanationStatus").value("READY"));

        // Q-04 detail includes explanationStatus = READY
        mvc.perform(get("/api/v1/manager/questions/" + blankQ1.getQuestionId())
                        .with(user(UserPrincipal.create(manager))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.explanationStatus").value("READY"));

        // Manager receives AI_EXPLANATION_READY notification via NT-01.
        MvcResult notifRes = mvc.perform(get("/api/v1/student/notifications")
                        .with(user(UserPrincipal.create(manager))))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode notifs = json.readTree(notifRes.getResponse().getContentAsString()).path("data").path("content");
        assertTrue(notifs.size() >= 1);
        JsonNode first = notifs.get(0);
        assertEquals("AI_EXPLANATION_READY", first.path("type").asText());
        assertTrue(first.path("link").asText().startsWith("/manager/question-bank?ids="));

        // Re-queuing with overwrite=false skips already filled questions.
        mvc.perform(post("/api/v1/manager/questions/ai/explanations")
                        .with(user(UserPrincipal.create(manager)))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of(
                                "questionIds", List.of(blankQ1.getQuestionId()),
                                "overwrite", false))))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.data.queuedCount").value(0))
                .andExpect(jsonPath("$.data.skippedCount").value(1));
    }

    @Test
    void ai04FailedBatchMarksStatusFailedAndSendsFailedNotification() throws Exception {
        providerStatus = 500;
        MvcResult accepted = mvc.perform(post("/api/v1/manager/questions/ai/explanations")
                        .with(user(UserPrincipal.create(manager)))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of(
                                "questionIds", List.of(blankQ1.getQuestionId()),
                                "overwrite", false))))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.data.queuedCount").value(1))
                .andReturn();

        long jobId = json.readTree(accepted.getResponse().getContentAsString()).path("data").path("jobId").asLong();
        awaitJobDone(jobId);

        mvc.perform(get("/api/v1/manager/questions/" + blankQ1.getQuestionId())
                        .with(user(UserPrincipal.create(manager))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.explanationStatus").value("FAILED"));

        mvc.perform(get("/api/v1/student/notifications")
                        .with(user(UserPrincipal.create(manager))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content[0].type").value("AI_EXPLANATION_FAILED"))
                .andExpect(jsonPath("$.data.content[0].link").value("/manager/question-bank/" + blankQ1.getQuestionId()));
    }

    @Test
    void publishBlockedWithoutExplanationOrWhilePendingAndAllowedOnceFilled() throws Exception {
        // Batch create without explanation still succeeds (201).
        String batchBody = json.writeValueAsString(List.of(Map.of(
                "courseId", course.getCourseId(),
                "questionType", "SINGLE_CHOICE",
                "difficulty", "EASY",
                "content", "Created without explanation?",
                "options", List.of(
                        Map.of("optionText", "Yes", "isCorrect", true, "orderIndex", 0),
                        Map.of("optionText", "No", "isCorrect", false, "orderIndex", 1)
                ))));
        MvcResult createRes = mvc.perform(post("/api/v1/manager/questions/batch")
                        .param("courseId", course.getCourseId().toString())
                        .param("moduleId", module.getModuleId().toString())
                        .with(user(UserPrincipal.create(manager)))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(batchBody))
                .andExpect(status().isCreated())
                .andReturn();
        long createdId = json.readTree(createRes.getResponse().getContentAsString())
                .path("data").get(0).path("questionId").asLong();

        // Update without explanation still succeeds (200).
        mvc.perform(put("/api/v1/manager/questions/" + createdId)
                        .with(user(UserPrincipal.create(manager)))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"content\":\"Updated without explanation?\"}"))
                .andExpect(status().isOk());

        // Single publish without explanation -> 400 VALIDATION_ERROR.
        mvc.perform(patch("/api/v1/manager/questions/" + createdId + "/status")
                        .with(user(UserPrincipal.create(manager)))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\":\"ACTIVE\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(containsString("Explanation is required to publish")));

        // Batch publish without explanation -> 400 VALIDATION_ERROR.
        mvc.perform(patch("/api/v1/manager/questions/batch/status")
                        .with(user(UserPrincipal.create(manager)))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("questionIds", List.of(createdId), "status", "ACTIVE"))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(containsString("Explanation is required to publish")));

        // Group publish with a member missing explanation -> 400 VALIDATION_ERROR.
        Long groupId = tx.execute(s -> {
            QuestionGroup g = QuestionGroup.builder().course(course).module(module)
                    .questionType("QUIZ").title("Passage").passageText("Passage body").build();
            em.persist(g);
            Question q = em.find(Question.class, createdId);
            q.setGroup(g);
            em.merge(q);
            return g.getGroupId();
        });
        mvc.perform(post("/api/v1/manager/questions/groups/" + groupId + "/publish")
                        .with(user(UserPrincipal.create(manager))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(containsString("Explanation is required to publish")));

        // Even with explanation text, a PENDING background job blocks publish.
        tx.executeWithoutResult(s -> {
            Question q = em.find(Question.class, createdId);
            q.setAiExplanation("Old draft explanation");
            em.merge(q);
            ManagerExplanationJob pendingJob = jobRepo.save(ManagerExplanationJob.builder()
                    .user(manager).overwrite(true).status("PENDING").totalCount(1).build());
            jobItemRepo.save(ManagerExplanationJobItem.builder()
                    .job(pendingJob).question(q).status("PENDING").build());
        });
        mvc.perform(patch("/api/v1/manager/questions/" + createdId + "/status")
                        .with(user(UserPrincipal.create(manager)))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\":\"ACTIVE\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(containsString("Explanation is required to publish")));

        // Once job is no longer PENDING and explanation is present, publish succeeds!
        tx.executeWithoutResult(s -> {
            jobRepo.findAll().forEach(j -> {
                j.setStatus("COMPLETED");
                jobRepo.save(j);
            });
        });
        mvc.perform(post("/api/v1/manager/questions/groups/" + groupId + "/publish")
                        .with(user(UserPrincipal.create(manager))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.publishedQuestionCount").value(1));
    }

    private Question createChoiceQuestion(String content, String explanation) {
        Question q = Question.builder()
                .course(course)
                .module(module)
                .createdBy(manager)
                .questionType("SINGLE_CHOICE")
                .difficulty("EASY")
                .content(content)
                .aiExplanation(explanation)
                .aiExplanationSource(explanation != null ? "MANAGER" : null)
                .status("INACTIVE")
                .approvalStatus("APPROVED")
                .build();
        em.persist(q);
        em.persist(AnswerOption.builder().question(q).optionText("Correct").isCorrect(true).orderIndex(0).build());
        em.persist(AnswerOption.builder().question(q).optionText("Wrong").isCorrect(false).orderIndex(1).build());
        return q;
    }

    private void awaitJobDone(long jobId) throws InterruptedException {
        long deadline = System.currentTimeMillis() + 10_000;
        while (System.currentTimeMillis() < deadline) {
            String st = tx.execute(s -> jobRepo.findById(jobId).map(ManagerExplanationJob::getStatus).orElse("MISSING"));
            if ("COMPLETED".equals(st) || "FAILED".equals(st)) {
                return;
            }
            Thread.sleep(50);
        }
        fail("Timed out waiting for ManagerExplanationJob " + jobId + " to finish");
    }
}
