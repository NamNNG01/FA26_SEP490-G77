package com.examprep.controllers;

import com.examprep.ai.AiClient;
import com.examprep.controllers.student.Fixtures;
import com.examprep.entities.AiUsageLog;
import com.examprep.entities.Course;
import com.examprep.entities.Document;
import com.examprep.entities.User;
import com.examprep.services.FlashcardGenerationWorker;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import javax.sql.DataSource;
import java.nio.charset.StandardCharsets;
import java.sql.Connection;

import static com.examprep.controllers.student.Fixtures.as;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * API 31 (Deadline 2 group E): POST /api/v1/ai/flashcards/generate — validation order, error codes,
 * quota reservation and the queued job row. The AI call and the worker are mocked; each test uses
 * its own users because the rate-limit window lives in the service instance.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
public class AiFlashcardApiTest {
    private static final String URL = "/api/v1/ai/flashcards/generate";
    private static final String CONTENT =
            "Photosynthesis converts light energy into chemical energy stored in glucose inside chloroplasts.";

    /** The 10MB service limit is below the default 1MB boundary; raise it so the service decides. */
    @DynamicPropertySource
    static void multipartLimits(DynamicPropertyRegistry registry) {
        registry.add("spring.servlet.multipart.max-file-size", () -> "20MB");
        registry.add("spring.servlet.multipart.max-request-size", () -> "25MB");
    }

    @Autowired MockMvc mvc;
    @Autowired EntityManager em;
    @Autowired DataSource dataSource;
    @MockBean AiClient aiClient;
    @MockBean FlashcardGenerationWorker worker;

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
        assertEquals("PENDING", job.getStatus());
        assertEquals("FREE", job.getBillingSource());
        assertEquals(20, job.getQuestionCount());
        assertTrue(job.getReservedTokens() > 0);
        assertTrue(job.getRequestParams().contains("numberOfCards"), job.getRequestParams());

        Document document = em.createQuery(
                        "select d from Document d where d.user = :user and d.generationType = 'FLASHCARD'", Document.class)
                .setParameter("user", student).getSingleResult();
        assertEquals(CONTENT, document.getExtractedContent());

        verify(worker).dispatch(anyLong());
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

    // ------------------------------------------------------------------ helpers

    private AiUsageLog onlyJob(User user) {
        return em.createQuery("select l from AiUsageLog l where l.user = :user and l.purpose = 'FLASHCARD_GENERATE'",
                        AiUsageLog.class)
                .setParameter("user", user).getSingleResult();
    }

    private static MockMultipartFile txt(String content) {
        return new MockMultipartFile("file", "notes.txt", "text/plain", content.getBytes(StandardCharsets.UTF_8));
    }
}
