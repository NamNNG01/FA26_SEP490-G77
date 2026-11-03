package com.examprep.controllers.student;

import com.examprep.dto.practice.ModulePracticeRequests;
import com.examprep.dto.practice.ModulePracticeResponses;
import com.examprep.entities.*;
import com.examprep.entities.Module;
import com.examprep.services.student.ModulePracticeAnswerService;
import com.examprep.services.student.ModulePracticeService;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The whole Module Practice service layer with **no ambient transaction and no
 * Open-Entity-Manager-In-View** — how production behaves for any call that is not a web request, and
 * exactly what breaks if a method maps a lazy association outside a transaction.
 *
 * <p>The other integration tests are {@code @Transactional}, so their transaction keeps the
 * EntityManager open for the whole test and would hide such a defect. This class deliberately opts
 * out of both safeties and drives the services directly (no {@code MockMvc}, so not even the OSIV
 * interceptor can help).</p>
 *
 * <p>Fixtures are seeded and torn down in explicit transactions. The class declares its own property
 * set, so it gets its own Spring context and its own in-memory database — nothing it commits is
 * visible to any other test class.</p>
 */
@SpringBootTest
@ActiveProfiles("test")
class ModulePracticeWithoutOpenSessionInViewTest {

    private static final ObjectMapper JSON = new ObjectMapper();

    @DynamicPropertySource
    static void productionLikeProperties(DynamicPropertyRegistry registry) {
        registry.add("app.ai.api-key", () -> "test-only-key");
        registry.add("app.ai.model", () -> "fake-model");
        // Nothing here reaches the provider; the test stays offline and deterministic.
        registry.add("app.ai.base-url", () -> "http://127.0.0.1:1/v1beta");
        registry.add("spring.jpa.open-in-view", () -> false);
        registry.add("app.student-ai.grading-threads", () -> 0);
        registry.add("app.student-ai.sweep-ms", () -> 3_600_000L);
    }

    @Autowired private ModulePracticeService practice;
    @Autowired private ModulePracticeAnswerService answers;
    @Autowired private com.examprep.repositories.QuestionPracticeProgressRepository progressRepository;
    @Autowired private EntityManager em;
    @Autowired private PlatformTransactionManager transactionManager;

    private Long studentId;
    private Long managerId;
    private Long categoryId;
    private Long courseId;
    private Long moduleId;

    @BeforeEach
    void seed() {
        inTransaction(() -> {
            Category category = Category.builder().name("Detached")
                    .slug(UUID.randomUUID().toString()).build();
            em.persist(category);
            User manager = account(User.ROLE_COURSE_MANAGER);
            User student = account(User.ROLE_STUDENT);
            Course course = Course.builder().categoryId(category.getCategoryId()).category(category)
                    .manager(manager).title("Detached course").slug(UUID.randomUUID().toString())
                    .isPublished(true).build();
            em.persist(course);
            Module module = Module.builder().course(course).title("OOP").orderIndex(1)
                    .status(Module.STATUS_VISIBLE).build();
            em.persist(module);
            em.persist(Enrollment.builder().user(student).course(course).enrolledAt(Instant.now())
                    .status(Enrollment.STATUS_ACTIVE).build());
            for (int index = 0; index < 2; index++) {
                Question question = Question.builder().course(course).module(module)
                        .questionType("SINGLE_CHOICE").content("Detached question " + index)
                        .status("ACTIVE").approvalStatus("APPROVED").build();
                em.persist(question);
                em.persist(AnswerOption.builder().question(question).optionText("right").isCorrect(true)
                        .orderIndex(0).build());
                em.persist(AnswerOption.builder().question(question).optionText("wrong").isCorrect(false)
                        .orderIndex(1).build());
            }
            studentId = student.getUserId();
            managerId = manager.getUserId();
            categoryId = category.getCategoryId();
            courseId = course.getCourseId();
            moduleId = module.getModuleId();
        });
    }

    @AfterEach
    void tearDown() {
        inTransaction(() -> {
            em.createQuery("DELETE FROM QuestionPracticeSession x WHERE x.module.moduleId = :m")
                    .setParameter("m", moduleId).executeUpdate();
            em.createQuery("DELETE FROM QuestionPracticeProgress x WHERE x.module.moduleId = :m")
                    .setParameter("m", moduleId).executeUpdate();
            em.createQuery("DELETE FROM AnswerOption o WHERE o.question.module.moduleId = :m")
                    .setParameter("m", moduleId).executeUpdate();
            em.createQuery("DELETE FROM Question q WHERE q.module.moduleId = :m")
                    .setParameter("m", moduleId).executeUpdate();
            em.createQuery("DELETE FROM Module x WHERE x.moduleId = :m")
                    .setParameter("m", moduleId).executeUpdate();
            em.createQuery("DELETE FROM Enrollment e WHERE e.course.courseId = :c")
                    .setParameter("c", courseId).executeUpdate();
            em.createQuery("DELETE FROM Course c WHERE c.courseId = :c")
                    .setParameter("c", courseId).executeUpdate();
            em.createQuery("DELETE FROM Category c WHERE c.categoryId = :k")
                    .setParameter("k", categoryId).executeUpdate();
            em.createQuery("DELETE FROM User u WHERE u.userId IN :ids")
                    .setParameter("ids", List.of(studentId, managerId)).executeUpdate();
        });
    }

    @Test
    void everyReadModelMapsWithoutAnAmbientTransaction() throws Exception {
        // MP-01 maps the module's and the course's titles, which are lazy associations.
        ModulePracticeResponses.Overview overview = practice.overview(studentId, moduleId);
        assertEquals(2, overview.totalQuestions());
        assertEquals("OOP", overview.moduleTitle());
        assertEquals("Detached course", overview.courseTitle());
        assertEquals(0, overview.practicedQuestions());

        // MP-02 create, then MP-02 resume, then MP-03 — all mapping lazy relations.
        ModulePracticeResponses.SessionDetail created = practice.startOrResume(studentId, moduleId, null);
        assertFalse(created.resumed());
        assertEquals(2, created.questionCount());
        assertEquals("OOP", created.moduleTitle());
        assertEquals("Detached course", created.courseTitle());
        long sessionId = created.sessionId();
        long sessionQuestionId = created.questions().get(0).sessionQuestionId();
        List<Long> order = questionOrder(created);

        ModulePracticeResponses.SessionDetail resumed = practice.startOrResume(studentId, moduleId, null);
        assertTrue(resumed.resumed());
        assertEquals(sessionId, resumed.sessionId());
        assertEquals(order, questionOrder(resumed), "the persisted order survives a resume");

        assertEquals(sessionId, practice.session(studentId, sessionId).sessionId());

        // MP-04 reads the frozen paper.
        ModulePracticeResponses.QuestionView view = practice.question(studentId, sessionId, sessionQuestionId);
        assertEquals(2, view.questionsTotal());
        assertEquals(2, view.options().size());
        assertNotNull(view.content());
        long optionId = view.options().get(0).optionId();

        // MP-05 writes an attempt; MP-06 reads it back.
        ModulePracticeResponses.AnswerSubmitted submitted = answers.submit(studentId, sessionId,
                sessionQuestionId, new ModulePracticeRequests.SubmitAnswer(
                        JSON.readTree("{\"selectedOptionIds\":[" + optionId + "]}"), 7, "detached-key"));
        assertEquals(1, submitted.attemptNumber());
        assertFalse(submitted.duplicate());
        assertEquals(1, submitted.session().answeredCount());
        assertEquals(1, answers.history(studentId, sessionId, sessionQuestionId).attempts().size());

        // MP-08 reports both kinds of statistics.
        ModulePracticeResponses.Result result = practice.result(studentId, sessionId);
        assertEquals(2, result.totalQuestions());
        assertEquals(1, result.answeredQuestions());
        assertEquals("OOP", result.moduleTitle());
        assertEquals(1, result.totalAttempts());

        // MP-11, MP-07 and MP-12 close the loop.
        assertNotNull(practice.reviewQuestions(studentId, moduleId, 0, 20));
        assertEquals("COMPLETED", practice.complete(studentId, sessionId).status());
        assertEquals(1, practice.resetProgress(studentId, moduleId).deletedSessions());
        assertEquals(0, practice.overview(studentId, moduleId).practicedQuestions());
    }

    /**
     * The progress read-modify-write is serialised: two writers of the same
     * (student, module, question) — a submit and a late AI grade, possibly in different sessions —
     * take the same row lock, so neither can lose the other's update.
     */
    @Test
    void twoWritersOfOneProgressRowAreSerialised() throws Exception {
        ModulePracticeResponses.SessionDetail created = practice.startOrResume(studentId, moduleId, null);
        long sessionId = created.sessionId();
        long sessionQuestionId = created.questions().get(0).sessionQuestionId();
        long questionId = created.questions().get(0).questionId();
        ModulePracticeResponses.QuestionView view = practice.question(studentId, sessionId, sessionQuestionId);
        answers.submit(studentId, sessionId, sessionQuestionId, new ModulePracticeRequests.SubmitAnswer(
                JSON.readTree("{\"selectedOptionIds\":[" + view.options().get(0).optionId() + "]}"), 1, null));

        CountDownLatch held = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        CountDownLatch secondDone = new CountDownLatch(1);

        Thread first = new Thread(() -> inTransaction(() -> {
            progressRepository.lockByUserModuleQuestion(studentId, moduleId, questionId);
            held.countDown();
            awaitQuietly(release);
        }), "progress-writer-1");
        first.setDaemon(true);
        first.start();
        assertTrue(held.await(5, TimeUnit.SECONDS), "the first writer must acquire the row lock");

        Thread second = new Thread(() -> inTransaction(() -> {
            progressRepository.lockByUserModuleQuestion(studentId, moduleId, questionId);
            secondDone.countDown();
        }), "progress-writer-2");
        second.setDaemon(true);
        second.start();

        assertFalse(secondDone.await(300, TimeUnit.MILLISECONDS),
                "the second writer must block on the same row instead of racing it");
        release.countDown();
        assertTrue(secondDone.await(10, TimeUnit.SECONDS),
                "and must proceed as soon as the first writer commits");
        first.join(5_000);
        second.join(5_000);

        // The row the two writers share is the one the student's practice actually produced.
        assertEquals(1, progressRepository
                .findByUser_UserIdAndModule_ModuleIdAndQuestion_QuestionId(studentId, moduleId, questionId)
                .orElseThrow().getTotalAttempts());
    }

    private static void awaitQuietly(CountDownLatch latch) {
        try {
            latch.await(30, TimeUnit.SECONDS);
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
        }
    }

    private static List<Long> questionOrder(ModulePracticeResponses.SessionDetail session) {
        List<Long> ids = new ArrayList<>();
        for (ModulePracticeResponses.SessionQuestionSummary row : session.questions()) {
            ids.add(row.questionId());
        }
        return ids;
    }

    private User account(String role) {
        User value = User.builder().email(UUID.randomUUID() + "@example.com").fullName(role)
                .passwordHash("test-hash").roleName(role).build();
        em.persist(value);
        return value;
    }

    private void inTransaction(Runnable work) {
        new TransactionTemplate(transactionManager).executeWithoutResult(status -> work.run());
    }
}
