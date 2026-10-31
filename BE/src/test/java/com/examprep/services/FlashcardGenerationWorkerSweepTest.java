package com.examprep.services;

import com.examprep.ai.AiClient;
import com.examprep.ai.AiResponse;
import com.examprep.controllers.student.Fixtures;
import com.examprep.entities.AiUsageLog;
import com.examprep.entities.Document;
import com.examprep.entities.User;
import com.examprep.repositories.AiUsageLogRepository;
import com.examprep.repositories.DocumentRepository;
import com.examprep.repositories.UserRepository;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

/**
 * Plan §7 Review Focus #3: the flashcard sweep is called directly (the ambient scheduler is disabled
 * for tests), mirroring the house grading sweep test. Stale PROCESSING rows are failed with a full
 * refund; a fresh claim is left alone; a stuck PENDING row is re-dispatched into the real worker.
 */
@SpringBootTest
@ActiveProfiles("test")
@Transactional
class FlashcardGenerationWorkerSweepTest {
    @Autowired FlashcardGenerationWorker worker;
    @Autowired EntityManager em;
    @Autowired UserRepository users;
    @Autowired DocumentRepository documents;
    @Autowired AiUsageLogRepository logs;
    @Autowired PlatformTransactionManager transactionManager;
    @MockBean AiClient aiClient;

    Fixtures f;

    @BeforeEach
    void setUp() {
        f = new Fixtures(em);
    }

    @Test
    void sweepFailsUntrackedStaleProcessingAndRefunds() {
        User student = f.account(User.ROLE_STUDENT);
        Long id = staleProcessing(student, 170);

        worker.sweep();

        AiUsageLog failed = em.find(AiUsageLog.class, id);
        assertEquals("FAILED", failed.getStatus());
        assertEquals("AI_TIMEOUT", failed.getErrorMessage());
        assertEquals(0, failed.getReservedTokens());
        assertNull(failed.getResult());
    }

    @Test
    void sweepFailsTrackedStaleClaimButLeavesAFreshClaimAlone() {
        User staleUser = f.account(User.ROLE_STUDENT);
        Long staleId = staleProcessing(staleUser, 170);
        User freshUser = f.account(User.ROLE_STUDENT);
        Long freshId = staleProcessing(freshUser, 170);

        // Same old createdAt for both: only the in-process claim clock distinguishes them.
        worker.registerClaimForTest(staleId, Instant.now().minus(30, ChronoUnit.MINUTES));
        worker.registerClaimForTest(freshId, Instant.now());
        worker.sweep();

        AiUsageLog failed = em.find(AiUsageLog.class, staleId);
        assertEquals("FAILED", failed.getStatus());
        assertEquals("AI_TIMEOUT", failed.getErrorMessage());
        assertEquals(0, failed.getReservedTokens());

        AiUsageLog running = em.find(AiUsageLog.class, freshId);
        assertEquals("PROCESSING", running.getStatus());
        assertEquals(170, running.getReservedTokens());
        assertNull(running.getErrorMessage());
    }

    @Test
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    void sweepRedispatchesStuckPendingJob() throws Exception {
        when(aiClient.complete(any())).thenReturn(AiResponse.builder()
                .text("{\"cards\":[{\"frontText\":\"Photosynthesis?\",\"backText\":\"Quang hợp\"}]}")
                .inputTokens(3).outputTokens(2).model("gemini-test").build());
        long id = committedPendingJob();

        worker.sweep();

        // The runner claims (PROCESSING) then finishes (SUCCESS) in its own transactions; the mock AI
        // is instant, so waiting for SUCCESS proves both the re-dispatch and the completed pipeline.
        String status = "PENDING";
        long deadline = System.currentTimeMillis() + 5_000;
        while (System.currentTimeMillis() < deadline) {
            status = logs.findById(id).map(AiUsageLog::getStatus).orElse("MISSING");
            if (!"PENDING".equals(status) && !"PROCESSING".equals(status)) {
                break;
            }
            Thread.sleep(50);
        }
        assertEquals("SUCCESS", status);
    }

    // ------------------------------------------------------------------ helpers

    /** Row older than 2×timeout + the test sweep period, so both sweep arms consider it stale. */
    private Long staleProcessing(User user, int reserved) {
        AiUsageLog job = AiUsageLog.builder()
                .user(user).purpose("FLASHCARD_GENERATE").status("PROCESSING")
                .reservedTokens(reserved).billingSource("FREE")
                .build();
        em.persist(job);
        em.flush();
        em.clear();
        em.createNativeQuery("UPDATE ai_usage_logs SET created_at = :old WHERE log_id = :id")
                .setParameter("old", Instant.now().minus(3, ChronoUnit.HOURS))
                .setParameter("id", job.getLogId()).executeUpdate();
        return job.getLogId();
    }

    /** Committed job + material, because the re-dispatched worker runs in another transaction. */
    private long committedPendingJob() {
        Long id = new TransactionTemplate(transactionManager).execute(status -> {
            User user = users.save(User.builder()
                    .email(UUID.randomUUID() + "@example.com").fullName("student user")
                    .passwordHash("test-hash").roleName(User.ROLE_STUDENT).build());
            Document document = documents.save(Document.builder()
                    .user(user).generationType("FLASHCARD").status("COMPLETED")
                    .title("Notes").extractedContent("Photosynthesis converts light energy into glucose.")
                    .createdAt(Instant.now()).build());
            AiUsageLog job = logs.save(AiUsageLog.builder()
                    .user(user).purpose("FLASHCARD_GENERATE").status("PENDING")
                    .reservedTokens(170).billingSource("FREE").questionCount(2)
                    .requestParams("{\"docId\":" + document.getDocId()
                            + ",\"numberOfCards\":2,\"language\":\"VI\",\"style\":\"QA\",\"focusTopic\":\"\"}")
                    .build());
            logs.flush();
            em.createNativeQuery("UPDATE ai_usage_logs SET created_at = :old WHERE log_id = :id")
                    .setParameter("old", Instant.now().minus(10, ChronoUnit.MINUTES))
                    .setParameter("id", job.getLogId()).executeUpdate();
            return job.getLogId();
        });
        return id;
    }
}
