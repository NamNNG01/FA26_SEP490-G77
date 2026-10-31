package com.examprep.controllers;

import com.examprep.ai.AiClient;
import com.examprep.ai.AiResponse;
import com.examprep.controllers.student.Fixtures;
import com.examprep.entities.AiUsageLog;
import com.examprep.entities.Course;
import com.examprep.entities.Deck;
import com.examprep.entities.Document;
import com.examprep.entities.SubscriptionPlan;
import com.examprep.entities.User;
import com.examprep.entities.UserSubscription;
import com.examprep.repositories.AiUsageLogRepository;
import com.examprep.repositories.DeckRepository;
import com.examprep.repositories.UserRepository;
import com.examprep.services.AiQuotaService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import javax.sql.DataSource;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static com.examprep.controllers.student.Fixtures.as;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * API 31 + 32 + 33 (Deadline 2 group E): POST /api/v1/ai/flashcards/generate, the generation poll and
 * GET /api/v1/ai/usage/me.
 *
 * <p>Validation tests stay inside the test transaction, so the real worker can never see their
 * uncommitted job rows and every reservation is rolled back. The end-to-end flow tests opt out of
 * that transaction ({@link Propagation#NOT_SUPPORTED}) so the queued job is visible to the worker
 * thread and the poll can observe the real async pipeline. Poll-mapping tests seed rows directly,
 * which keeps the status→payload mapping deterministic.</p>
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
public class AiFlashcardApiTest {
    private static final String URL = "/api/v1/ai/flashcards/generate";
    private static final String DETAIL = "/api/v1/ai/flashcards/generations/";
    private static final String USAGE = "/api/v1/ai/usage/me";
    private static final String BULK = "/api/v1/flashcards/bulk";
    private static final String CONTENT =
            "Photosynthesis converts light energy into chemical energy stored in glucose inside chloroplasts.";

    /** The 10MB service limit is below the default 1MB boundary; raise it so the service decides. */
    @DynamicPropertySource
    static void limits(DynamicPropertyRegistry registry) {
        registry.add("spring.servlet.multipart.max-file-size", () -> "20MB");
        registry.add("spring.servlet.multipart.max-request-size", () -> "25MB");
        // Short AI budget so the timeout test does not sleep for the production 90s.
        registry.add("app.ai.flashcard.timeout-ms", () -> "400");
    }

    @Autowired MockMvc mvc;
    @Autowired EntityManager em;
    @Autowired DataSource dataSource;
    @Autowired ObjectMapper json;
    @Autowired UserRepository users;
    @Autowired AiUsageLogRepository logs;
    @Autowired DeckRepository decks;
    @MockBean AiClient aiClient;

    @Value("${app.student-ai.free-daily-tokens:20000}") long freeDailyTokens;

    Fixtures f;

    /** H2 stand-in for Postgres' pg_advisory_xact_lock (used by the AI quota). */
    public static Integer advisoryLock(Long key) { return 0; }

    @BeforeEach
    void setUp() throws Exception {
        try (Connection connection = dataSource.getConnection()) {
            connection.createStatement().execute("CREATE ALIAS IF NOT EXISTS pg_advisory_xact_lock FOR '"
                    + AiFlashcardApiTest.class.getName() + ".advisoryLock'");
        }
        f = new Fixtures(em);
    }

    // ------------------------------------------------------------------ happy path

    @Test
    void generateAcceptsTextAndReservesQuota() throws Exception {
        User student = f.account(User.ROLE_STUDENT);

        mvc.perform(multipart(URL).param("text", CONTENT).with(as(student)))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.data.status").value("PENDING"))
                .andExpect(jsonPath("$.data.generationId").isNumber())
                .andExpect(jsonPath("$.data.reservedTokens").isNumber());

        em.flush();
        AiUsageLog job = onlyJob(student);
        // The worker runs on another thread and cannot see this uncommitted test row.
        assertEquals("PENDING", job.getStatus());
        assertEquals("FREE", job.getBillingSource());
        assertEquals(20, job.getQuestionCount());
        assertTrue(job.getReservedTokens() > 0);
        assertTrue(job.getRequestParams().contains("numberOfCards"), job.getRequestParams());

        Document document = em.createQuery(
                        "select d from Document d where d.user = :user and d.generationType = 'FLASHCARD'", Document.class)
                .setParameter("user", student).getSingleResult();
        assertEquals(CONTENT, document.getExtractedContent());
        // The worker finds the material through request_params.docId (no dedicated column).
        assertTrue(job.getRequestParams().contains("\"docId\":" + document.getDocId()), job.getRequestParams());
    }

    // ------------------------------------------------------------------ async pipeline (real worker)

    @Test
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    void generationFlowCompletesAndStoresCards() throws Exception {
        User student = committedAccount(User.ROLE_STUDENT);
        when(aiClient.complete(any())).thenReturn(AiResponse.builder()
                .text("""
                        {"cards":[
                          {"frontText":"Photosynthesis là gì?","backText":"Quá trình quang hợp ở thực vật"},
                          {"frontText":"Chloroplast là gì?","backText":"Bào quan chứa diệp lục"}
                        ]}""")
                .inputTokens(120).outputTokens(30).model("gemini-test").build());

        long id = generate(student);

        JsonNode data = await(student, id, "COMPLETED");
        assertEquals(2, data.path("cards").size());
        assertEquals("c1", data.path("cards").get(0).path("tempId").asText());
        assertEquals("Photosynthesis là gì?", data.path("cards").get(0).path("frontText").asText());
        assertEquals("c2", data.path("cards").get(1).path("tempId").asText());
        assertEquals(120, data.path("usage").path("inputTokens").asInt());
        assertEquals(30, data.path("usage").path("outputTokens").asInt());
        assertEquals(freeDailyTokens - 150, data.path("usage").path("remainingTokens").asLong());
        assertFalse(data.path("saved").asBoolean());
        assertNull(data.path("errorCode").textValue());

        AiUsageLog job = logs.findById(id).orElseThrow();
        assertEquals("SUCCESS", job.getStatus());
        assertEquals(0, job.getReservedTokens());
        assertEquals(2, job.getQuestionCount());
        assertTrue(job.getResult().contains("\"tempId\":\"c1\""), job.getResult());
    }

    @Test
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    void generationFlowFailsOnInvalidOutput() throws Exception {
        User student = committedAccount(User.ROLE_STUDENT);
        when(aiClient.complete(any())).thenReturn(AiResponse.builder().text("sorry, I cannot do that").build());

        long id = generate(student);

        JsonNode data = await(student, id, "FAILED");
        assertEquals(0, data.path("cards").size());
        assertEquals("AI_INVALID_OUTPUT", data.path("errorCode").asText());
        assertNull(data.path("usage").textValue());

        // The reservation was fully refunded: nothing is left reserved or charged.
        AiUsageLog job = logs.findById(id).orElseThrow();
        assertEquals("FAILED", job.getStatus());
        assertEquals(0, job.getReservedTokens());
        assertEquals("AI_INVALID_OUTPUT", job.getErrorMessage());
        assertNull(job.getInputTokens());
    }

    @Test
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    void aiTimeoutMapsErrorCode() throws Exception {
        User student = committedAccount(User.ROLE_STUDENT);
        when(aiClient.complete(any())).thenAnswer(call -> {
            Thread.sleep(3_000);
            return AiResponse.builder().text("{\"cards\":[]}").build();
        });

        long id = generate(student);

        JsonNode data = await(student, id, "FAILED");
        assertEquals("AI_TIMEOUT", data.path("errorCode").asText());
        assertEquals("FAILED", logs.findById(id).orElseThrow().getStatus());
    }

    // ------------------------------------------------------------------ API 32 mapping

    @Test
    void pollRejectsForeignAndMissingGeneration() throws Exception {
        User owner = f.account(User.ROLE_STUDENT);
        User other = f.account(User.ROLE_STUDENT);
        AiUsageLog job = seed(owner, "PENDING", null, null, null, null);
        em.flush();

        mvc.perform(get(DETAIL + job.getLogId()).with(as(other)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.data.code").value("GENERATION_NOT_FOUND"));

        mvc.perform(get(DETAIL + 999_999).with(as(owner)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.data.code").value("GENERATION_NOT_FOUND"));
    }

    @Test
    void pollMapsPendingAndFailedStates() throws Exception {
        User student = f.account(User.ROLE_STUDENT);
        AiUsageLog pending = seed(student, "PENDING", null, null, null, null);
        AiUsageLog processing = seed(student, "PROCESSING", null, null, null, null);
        AiUsageLog invalid = seed(student, "FAILED", null, null, null, "AI_INVALID_OUTPUT");
        AiUsageLog expired = seed(student, "FAILED", null, null, null, "RESERVATION_EXPIRED");
        em.flush();

        for (AiUsageLog job : new AiUsageLog[]{pending, processing}) {
            MvcResult result = mvc.perform(get(DETAIL + job.getLogId()).with(as(student)))
                    .andExpect(status().isOk())
                    .andReturn();
            JsonNode data = json.readTree(result.getResponse().getContentAsString(StandardCharsets.UTF_8)).path("data");
            assertEquals(job.getStatus(), data.path("status").asText());
            assertTrue(data.path("cards").isNull(), data.toString());
            assertTrue(data.path("usage").isNull(), data.toString());
            assertFalse(data.path("saved").asBoolean());
        }

        mvc.perform(get(DETAIL + invalid.getLogId()).with(as(student)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("FAILED"))
                .andExpect(jsonPath("$.data.cards").isEmpty())
                .andExpect(jsonPath("$.data.errorCode").value("AI_INVALID_OUTPUT"))
                .andExpect(jsonPath("$.data.errorMessage").doesNotExist());

        // A sweep-refunded PENDING reservation is reported as a timeout.
        mvc.perform(get(DETAIL + expired.getLogId()).with(as(student)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.errorCode").value("AI_TIMEOUT"));
    }

    @Test
    void pollRejectsOtherAiPurposeLog() throws Exception {
        User student = f.account(User.ROLE_STUDENT);
        // Owned by the caller, but an EXPLANATION log id is not a flashcard generation.
        AiUsageLog other = AiUsageLog.builder().user(student).purpose("EXPLANATION").status("SUCCESS")
                .billingSource("FREE").reservedTokens(0).build();
        em.persist(other);
        em.flush();

        mvc.perform(get(DETAIL + other.getLogId()).with(as(student)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.data.code").value("GENERATION_NOT_FOUND"));
    }

    @Test
    void pollDegradesUnexpectedResultShapeToEmptyCards() throws Exception {
        User student = f.account(User.ROLE_STUDENT);
        // H2's JSON column rejects syntactically invalid JSON, so this seeds valid JSON with the wrong
        // shape: the poll must degrade to cards=[] instead of a 500 (same guard as an unparseable body).
        AiUsageLog job = seed(student, "SUCCESS", "[]", 1, 1, null);
        em.flush();

        mvc.perform(get(DETAIL + job.getLogId()).with(as(student)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("COMPLETED"))
                .andExpect(jsonPath("$.data.cards").isEmpty());
    }

    @Test
    void pollMapsCompletedGenerationAndSavedFlag() throws Exception {
        User student = f.account(User.ROLE_STUDENT);
        AiUsageLog job = seed(student, "SUCCESS",
                "{\"cards\":[{\"tempId\":\"c1\",\"frontText\":\"Quang hợp là gì?\",\"backText\":\"Quá trình tổng hợp\"},"
                        + "{\"tempId\":\"c2\",\"frontText\":\"Diệp lục\",\"backText\":\"Sắc tố xanh\"}]}", 40, 10, null);
        em.flush();

        mvc.perform(get(DETAIL + job.getLogId()).with(as(student)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("COMPLETED"))
                .andExpect(jsonPath("$.data.cards[0].tempId").value("c1"))
                .andExpect(jsonPath("$.data.cards[0].frontText").value("Quang hợp là gì?"))
                .andExpect(jsonPath("$.data.cards[1].tempId").value("c2"))
                .andExpect(jsonPath("$.data.usage.inputTokens").value(40))
                .andExpect(jsonPath("$.data.usage.outputTokens").value(10))
                .andExpect(jsonPath("$.data.usage.remainingTokens").value(freeDailyTokens - 50))
                .andExpect(jsonPath("$.data.saved").value(false))
                .andExpect(jsonPath("$.data.errorCode").doesNotExist());

        // API 30 sets saved_at; the poll exposes it.
        job.setSavedAt(Instant.now());
        em.flush();

        mvc.perform(get(DETAIL + job.getLogId()).with(as(student)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.saved").value(true));
    }

    // ------------------------------------------------------------------ input shape

    @Test
    void generateRejectsBothInputsTogether() throws Exception {
        User student = f.account(User.ROLE_STUDENT);
        MockMultipartFile file = txt(CONTENT);

        mvc.perform(multipart(URL).file(file).param("text", CONTENT).with(as(student)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.data.code").value("INPUT_CONFLICT"));
    }

    @Test
    void generateRejectsNeitherInput() throws Exception {
        User student = f.account(User.ROLE_STUDENT);

        mvc.perform(multipart(URL).with(as(student)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.data.code").value("INPUT_REQUIRED"));
    }

    @Test
    void generateRejectsUnsupportedFileType() throws Exception {
        User student = f.account(User.ROLE_STUDENT);
        MockMultipartFile file = new MockMultipartFile("file", "notes.exe", "application/octet-stream",
                CONTENT.getBytes(StandardCharsets.UTF_8));

        mvc.perform(multipart(URL).file(file).with(as(student)))
                .andExpect(status().isUnsupportedMediaType())
                .andExpect(jsonPath("$.data.code").value("UNSUPPORTED_FILE_TYPE"));
    }

    @Test
    void generateRejectsTooLargeFile() throws Exception {
        User student = f.account(User.ROLE_STUDENT);
        MockMultipartFile file = new MockMultipartFile("file", "big.txt", "text/plain", new byte[10 * 1024 * 1024 + 1]);

        mvc.perform(multipart(URL).file(file).with(as(student)))
                .andExpect(status().isPayloadTooLarge())
                .andExpect(jsonPath("$.data.code").value("FILE_TOO_LARGE"));
    }

    // ------------------------------------------------------------------ parameters

    @Test
    void generateRejectsBadParams() throws Exception {
        User student = f.account(User.ROLE_STUDENT);

        mvc.perform(multipart(URL).param("text", CONTENT).param("numberOfCards", "0").with(as(student)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.data.errors[0].field").value("numberOfCards"));

        mvc.perform(multipart(URL).param("text", CONTENT).param("style", "SOME_JUNK").with(as(student)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.data.errors[0].field").value("style"));
    }

    @Test
    void generateRejectsOversizeText() throws Exception {
        User student = f.account(User.ROLE_STUDENT);

        mvc.perform(multipart(URL).param("text", "a".repeat(20_001)).with(as(student)))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.data.code").value("CONTENT_TOO_LONG"));
    }

    // ------------------------------------------------------------------ content extraction

    @Test
    void generateMapsPdfWithoutTextLayer() throws Exception {
        User student = f.account(User.ROLE_STUDENT);
        MockMultipartFile file = new MockMultipartFile("file", "notes.pdf", "application/pdf",
                "not really a pdf".getBytes(StandardCharsets.UTF_8));

        mvc.perform(multipart(URL).file(file).with(as(student)))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.data.code").value("PDF_NO_TEXT_LAYER"));
    }

    @Test
    void generateMapsUnreadableDocx() throws Exception {
        User student = f.account(User.ROLE_STUDENT);
        MockMultipartFile file = new MockMultipartFile("file", "notes.docx",
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                "not really a docx".getBytes(StandardCharsets.UTF_8));

        mvc.perform(multipart(URL).file(file).with(as(student)))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.data.code").value("EMPTY_CONTENT"));
    }

    // ------------------------------------------------------------------ course access

    @Test
    void generateRejectsCourseNotEnrolled() throws Exception {
        User manager = f.account(User.ROLE_COURSE_MANAGER);
        Course course = f.course(manager);
        User student = f.account(User.ROLE_STUDENT);

        mvc.perform(multipart(URL).param("text", CONTENT)
                        .param("courseId", course.getCourseId().toString()).with(as(student)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.data.code").value("FORBIDDEN_COURSE"));
    }

    @Test
    void generateRejectsCourseManagerNotOwningCourse() throws Exception {
        User owner = f.account(User.ROLE_COURSE_MANAGER);
        Course course = f.course(owner);
        User otherManager = f.account(User.ROLE_COURSE_MANAGER);

        mvc.perform(multipart(URL).param("text", CONTENT)
                        .param("courseId", course.getCourseId().toString()).with(as(otherManager)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.data.code").value("FORBIDDEN_COURSE"));
    }

    // ------------------------------------------------------------------ quota

    @Test
    void generateReturns402WhenQuotaExhausted() throws Exception {
        User student = f.account(User.ROLE_STUDENT);
        // A PENDING reservation counts against the daily FREE allowance even before it is settled.
        em.persist(AiUsageLog.builder().user(student).purpose("EXPLANATION").status("PENDING")
                .billingSource("FREE").reservedTokens((int) freeDailyTokens).build());
        em.flush();

        mvc.perform(multipart(URL).param("text", CONTENT).param("numberOfCards", "1").with(as(student)))
                .andExpect(status().isPaymentRequired())
                .andExpect(jsonPath("$.data.code").value("AI_QUOTA_EXCEEDED"))
                .andExpect(jsonPath("$.data.estimatedTokens").isNumber());
    }

    // ------------------------------------------------------------------ rate limit

    @Test
    void generateFifthCallsHitsRateLimit() throws Exception {
        User student = f.account(User.ROLE_STUDENT);
        for (int call = 1; call <= 5; call++) {
            mvc.perform(multipart(URL).param("text", CONTENT).param("numberOfCards", "1").with(as(student)))
                    .andExpect(status().isAccepted());
        }

        mvc.perform(multipart(URL).param("text", CONTENT).with(as(student)))
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.data.code").value("RATE_LIMITED"));
    }

    // ------------------------------------------------------------------ API 33 usage

    @Test
    void usageMeReturnsFreeQuotaShape() throws Exception {
        User student = f.account(User.ROLE_STUDENT);

        JsonNode data = usage(student);

        assertEquals("FREE_QUOTA", data.path("billingSource").asText());
        assertTrue(data.path("planName").isNull(), data.toString());
        assertEquals(freeDailyTokens, data.path("tokenLimit").asLong());
        // The window is self-consistent: nothing is counted twice and nothing disappears.
        assertEquals(freeDailyTokens, data.path("tokenUsed").asLong() + data.path("tokenReserved").asLong()
                + data.path("tokenRemaining").asLong(), data.toString());

        // Deviation log #2: the FREE period is the enforced daily window, not a calendar month.
        LocalDate today = LocalDate.now(AiQuotaService.ZONE);
        Instant dayStart = today.atStartOfDay(AiQuotaService.ZONE).toInstant();
        Instant dayEnd = today.plusDays(1).atStartOfDay(AiQuotaService.ZONE).toInstant();
        assertNotNull(data.path("periodStart").textValue(), data.toString());
        assertNotNull(data.path("periodEnd").textValue(), data.toString());
        assertInstant(dayStart, Instant.parse(data.path("periodStart").asText()));
        assertInstant(dayEnd, Instant.parse(data.path("periodEnd").asText()));
        assertTrue(Instant.parse(data.path("periodEnd").asText())
                .isAfter(Instant.parse(data.path("periodStart").asText())));
        // Single clock: the period is exactly one house-zone day derived from the snapshot's reset instant.
        assertEquals(Instant.parse(data.path("periodEnd").asText()),
                Instant.parse(data.path("periodStart").asText()).plus(1, ChronoUnit.DAYS));
    }

    @Test
    void usageMeRejectsAnonymous() throws Exception {
        // No URL rule for /api/v1/ai/** beyond "authenticated", so Spring's entry point answers first
        // (401); the @PreAuthorize role guard never runs for an anonymous caller.
        mvc.perform(get(USAGE))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.success").value(false));
    }

    @Test
    void usageMeReturnsSubscriptionShape() throws Exception {
        User student = f.account(User.ROLE_STUDENT);
        Instant start = Instant.now().minus(5, ChronoUnit.DAYS);
        Instant end = Instant.now().plus(25, ChronoUnit.DAYS);
        SubscriptionPlan plan = SubscriptionPlan.builder().planName("Standard " + UUID.randomUUID())
                .price(new BigDecimal("99000")).durationDays(30).aiTokenLimit(600_000).build();
        em.persist(plan);
        em.persist(UserSubscription.builder().user(student).plan(plan).startDate(start).endDate(end)
                .status("ACTIVE").paidAmount(new BigDecimal("99000")).autoRenew(false).build());
        em.flush();

        JsonNode data = usage(student);

        // D1: the DB keeps PLAN, the API 33 payload names it SUBSCRIPTION.
        assertEquals("SUBSCRIPTION", data.path("billingSource").asText());
        assertEquals(plan.getPlanName(), data.path("planName").asText());
        assertEquals(600_000, data.path("tokenLimit").asLong());
        assertEquals(600_000, data.path("tokenUsed").asLong() + data.path("tokenReserved").asLong()
                + data.path("tokenRemaining").asLong(), data.toString());
        // The period is the subscription window, not the daily FREE window.
        assertInstant(start, Instant.parse(data.path("periodStart").asText()));
        assertInstant(end, Instant.parse(data.path("periodEnd").asText()));
    }

    @Test
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    void usageMeReflectsUsageAfterGenerate() throws Exception {
        User student = committedAccount(User.ROLE_STUDENT);
        when(aiClient.complete(any())).thenReturn(AiResponse.builder()
                .text("{\"cards\":[{\"frontText\":\"Photosynthesis là gì?\",\"backText\":\"Quá trình quang hợp\"}]}")
                .inputTokens(120).outputTokens(30).model("gemini-test").build());

        JsonNode before = usage(student);
        assertEquals(0, before.path("tokenUsed").asLong());
        assertEquals(freeDailyTokens, before.path("tokenRemaining").asLong());

        long id = generate(student);
        await(student, id, "COMPLETED");

        JsonNode after = usage(student);
        // The worker settled the reservation on the real token count (120 in + 30 out).
        assertEquals(150, after.path("tokenUsed").asLong(), after.toString());
        assertTrue(after.path("tokenUsed").asLong() > before.path("tokenUsed").asLong());
        assertEquals(freeDailyTokens - 150, after.path("tokenRemaining").asLong());
    }

    // ------------------------------------------------------------------ saved flag E2E (group D)

    @Test
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    void generationSavedFlagReflectsBulkSave() throws Exception {
        User student = committedAccount(User.ROLE_STUDENT);
        Deck deck = decks.save(Deck.builder().user(student).title("AI deck").isPublic(false).build());
        when(aiClient.complete(any())).thenReturn(AiResponse.builder()
                .text("{\"cards\":[{\"frontText\":\"Photosynthesis là gì?\",\"backText\":\"Quá trình quang hợp\"}]}")
                .inputTokens(100).outputTokens(20).model("gemini-test").build());

        long id = generate(student);
        assertFalse(await(student, id, "COMPLETED").path("saved").asBoolean());

        // Group D save endpoint: source=AI + the generation id flips ai_usage_logs.saved_at.
        Map<String, Object> body = Map.of(
                "deckId", deck.getDeckId(),
                "source", "AI",
                "aiGenerationId", id,
                "cards", List.of(Map.of("frontText", "Photosynthesis là gì?", "backText", "Quá trình quang hợp")));
        mvc.perform(post(BULK).with(as(student))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.createdCount").value(1));

        assertTrue(await(student, id, "COMPLETED").path("saved").asBoolean(), "API 32 must report saved=true");
        assertNotNull(logs.findById(id).orElseThrow().getSavedAt(), "ai_usage_logs.saved_at must be set");
    }

    // ------------------------------------------------------------------ helpers

    /** Committed user: the flow tests run without the test transaction, so the worker can see the jobs. */
    private User committedAccount(String role) {
        return users.save(User.builder()
                .email(UUID.randomUUID() + "@example.com")
                .fullName(role + " user")
                .passwordHash("test-hash")
                .roleName(role)
                .build());
    }

    private long generate(User user) throws Exception {
        MvcResult result = mvc.perform(multipart(URL).param("text", CONTENT).param("numberOfCards", "2").with(as(user)))
                .andExpect(status().isAccepted())
                .andReturn();
        return json.readTree(result.getResponse().getContentAsString(StandardCharsets.UTF_8))
                .path("data").path("generationId").asLong();
    }

    /** Polls API 32 until the expected status appears (the worker runs asynchronously). */
    private JsonNode await(User user, long id, String expected) throws Exception {
        long deadline = System.currentTimeMillis() + 8_000;
        while (true) {
            MvcResult result = mvc.perform(get(DETAIL + id).with(as(user)))
                    .andExpect(status().isOk())
                    .andReturn();
            JsonNode data = json.readTree(result.getResponse().getContentAsString(StandardCharsets.UTF_8)).path("data");
            if (expected.equals(data.path("status").asText()) || System.currentTimeMillis() > deadline) {
                assertEquals(expected, data.path("status").asText(), data.toString());
                return data;
            }
            Thread.sleep(100);
        }
    }

    /** Polls API 33 and returns its {@code data} payload. */
    private JsonNode usage(User user) throws Exception {
        MvcResult result = mvc.perform(get(USAGE).with(as(user)))
                .andExpect(status().isOk())
                .andReturn();
        return json.readTree(result.getResponse().getContentAsString(StandardCharsets.UTF_8)).path("data");
    }

    /** Stored instants round-trip through H2 with microsecond precision; compare to the second. */
    private static void assertInstant(Instant expected, Instant actual) {
        assertNotNull(actual);
        assertTrue(Math.abs(expected.toEpochMilli() - actual.toEpochMilli()) <= 1_000,
                "expected " + expected + " but was " + actual);
    }

    private AiUsageLog seed(User user, String status, String result, Integer inputTokens, Integer outputTokens,
            String errorMessage) {
        AiUsageLog job = AiUsageLog.builder()
                .user(user).purpose("FLASHCARD_GENERATE").status(status)
                .billingSource("FREE").reservedTokens(0)
                .result(result).inputTokens(inputTokens).outputTokens(outputTokens)
                .errorMessage(errorMessage)
                .build();
        em.persist(job);
        return job;
    }

    private AiUsageLog onlyJob(User user) {
        return em.createQuery("select l from AiUsageLog l where l.user = :user and l.purpose = 'FLASHCARD_GENERATE'",
                        AiUsageLog.class)
                .setParameter("user", user).getSingleResult();
    }

    private static MockMultipartFile txt(String content) {
        return new MockMultipartFile("file", "notes.txt", "text/plain", content.getBytes(StandardCharsets.UTF_8));
    }
}
