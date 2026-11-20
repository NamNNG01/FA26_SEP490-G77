package com.examprep.controllers;

import com.examprep.dto.student.CodeExamRequests;
import com.examprep.entities.AnswerOption;
import com.examprep.entities.Category;
import com.examprep.entities.Course;
import com.examprep.entities.Enrollment;
import com.examprep.entities.Exam;
import com.examprep.entities.ExamAttempt;
import com.examprep.entities.ExamQuestion;
import com.examprep.entities.Module;
import com.examprep.entities.Question;
import com.examprep.entities.User;
import com.examprep.security.UserPrincipal;
import com.examprep.services.AttemptAutoSubmitter;
import com.examprep.services.PistonClient;
import com.examprep.services.StudentAttemptService;
import com.examprep.services.StudentCodeExamService;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/**
 * The database-level half of SA-01's idempotency (spec 6.1): two simultaneous starts of the same
 * student on the same exam must still create exactly one attempt, and the partial unique index
 * must refuse a second IN_PROGRESS row even when it is written directly.
 *
 * <p>Runs only against the Postgres profile, because H2 cannot create a partial index and the
 * whole point is the index:
 * {@code mvn test -DpostgresTests=true -Dtest=StudentAttemptConcurrencyPostgresTest}.</p>
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("postgres-test")
@EnabledIfSystemProperty(named = "postgresTests", matches = "true")
class StudentAttemptConcurrencyPostgresTest {

    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate db;
    @Autowired EntityManager em;
    @Autowired PlatformTransactionManager transactionManager;
    @Autowired StudentAttemptService studentAttempts;
    @Autowired StudentCodeExamService codeExams;
    @Autowired AttemptAutoSubmitter autoSubmitter;
    @MockBean PistonClient piston;

    private TransactionTemplate tx;
    private Long studentId;
    private Long managerId;
    private Long categoryId;
    private Long courseId;
    private Long moduleId;
    private Long examId;

    @BeforeEach
    void fixtures() {
        tx = new TransactionTemplate(transactionManager);
        tx.executeWithoutResult(status -> {
            User manager = User.builder().email(UUID.randomUUID() + "@example.com").fullName("Manager")
                    .passwordHash("test-only").roleName(User.ROLE_COURSE_MANAGER).build();
            User student = User.builder().email(UUID.randomUUID() + "@example.com").fullName("Student")
                    .passwordHash("test-only").roleName(User.ROLE_STUDENT).build();
            em.persist(manager);
            em.persist(student);

            Category category = Category.builder().name("Attempt concurrency")
                    .slug(UUID.randomUUID().toString()).build();
            em.persist(category);

            Course course = Course.builder().manager(manager).category(category)
                    .categoryId(category.getCategoryId()).title("Concurrent course")
                    .slug(UUID.randomUUID().toString()).isPublished(true).build();
            em.persist(course);

            Module module = Module.builder().course(course).title("Module").orderIndex(1).build();
            em.persist(module);

            em.persist(Enrollment.builder().course(course).user(student).enrolledAt(Instant.now())
                    .status(Enrollment.STATUS_ACTIVE).build());

            Exam exam = Exam.builder().course(course).module(module).createdBy(manager).title("Concurrent exam")
                    .durationMinutes(45).generationType("STATIC").isPractice(false)
                    .maxScore(BigDecimal.TEN).status("PUBLISHED").publishedAt(Instant.now()).build();
            em.persist(exam);

            Question question = Question.builder().module(module).questionType("SINGLE_CHOICE")
                    .content("Pick one").status("ACTIVE").approvalStatus("APPROVED").build();
            em.persist(question);
            em.persist(AnswerOption.builder().question(question).optionText("Right")
                    .isCorrect(true).orderIndex(0).build());
            em.persist(ExamQuestion.builder().exam(exam).question(question)
                    .weight(BigDecimal.ONE).orderIndex(0).build());

            em.flush();

            managerId = manager.getUserId();
            studentId = student.getUserId();
            categoryId = category.getCategoryId();
            courseId = course.getCourseId();
            moduleId = module.getModuleId();
            examId = exam.getExamId();
        });
    }

    @AfterEach
    void cleanup() {
        if (tx == null || examId == null) {
            return;
        }
        tx.executeWithoutResult(status -> {
            db.update("DELETE FROM attempt_start_keys WHERE attempt_id IN "
                    + "(SELECT attempt_id FROM exam_attempts WHERE exam_id = ?)", examId);
            db.update("DELETE FROM attempt_answers WHERE attempt_id IN "
                    + "(SELECT attempt_id FROM exam_attempts WHERE exam_id = ?)", examId);
            db.update("DELETE FROM exam_attempts WHERE exam_id = ?", examId);
            db.update("DELETE FROM exam_questions WHERE exam_id = ?", examId);
            db.update("DELETE FROM exam_groups WHERE exam_id = ?", examId);
            db.update("DELETE FROM exam_config WHERE exam_id = ?", examId);
            db.update("DELETE FROM enrollments WHERE course_id = ?", courseId);
            db.update("DELETE FROM exams WHERE exam_id = ?", examId);
            db.update("DELETE FROM answer_options WHERE question_id IN "
                    + "(SELECT question_id FROM questions WHERE module_id = ?)", moduleId);
            db.update("DELETE FROM questions WHERE module_id = ?", moduleId);
            db.update("DELETE FROM modules WHERE module_id = ?", moduleId);
            db.update("DELETE FROM courses WHERE course_id = ?", courseId);
            db.update("DELETE FROM categories WHERE category_id = ?", categoryId);
            db.update("DELETE FROM users WHERE user_id IN (?,?)", studentId, managerId);
        });
    }

    @Test
    void twoSimultaneousStartsCreateExactlyOneActiveAttempt() throws Exception {
        List<MvcResult> results = concurrently(this::start, this::start);

        long created = results.stream().filter(result -> result.getResponse().getStatus() == 201).count();
        long conflicts = results.stream().filter(result -> result.getResponse().getStatus() == 409).count();
        assertEquals(1, created, "exactly one start must create the attempt");
        assertEquals(1, conflicts, "the other start must receive 409 ATTEMPT_IN_PROGRESS");
        assertEquals(1, activeAttempts(), "only one IN_PROGRESS attempt may exist");
    }

    @Test
    void thePartialIndexRefusesASecondActiveRow() {
        Instant now = Instant.now();
        insertActive(now);
        assertThrows(DataIntegrityViolationException.class, () -> insertActive(now),
                "uq_attempt_one_active must reject a second IN_PROGRESS attempt");
        assertEquals(1, activeAttempts());
    }

    @Test
    void deadlineCloserWaitsForCodeAcceptedBeforeExpiry() throws Exception {
        Long questionId = tx.execute(status -> {
            Question question = Question.builder().module(em.getReference(Module.class, moduleId))
                    .questionType("CODE").content("Print the input").status("ACTIVE").approvalStatus("APPROVED").build();
            em.persist(question);
            em.persist(ExamQuestion.builder().exam(em.getReference(Exam.class, examId)).question(question)
                    .weight(BigDecimal.ONE).orderIndex(1).build());
            em.flush();
            db.update("INSERT INTO code_question_configs(question_id, allowed_languages) VALUES (?, '[\"PYTHON\"]')",
                    question.getQuestionId());
            db.update("INSERT INTO code_test_cases(question_id, input_data, expected_output) VALUES (?, 'x', 'x')",
                    question.getQuestionId());
            return question.getQuestionId();
        });
        long attemptId = studentAttempts.start(studentId, examId, null).attemptId();
        CountDownLatch judging = new CountDownLatch(1);
        CountDownLatch providerReady = new CountDownLatch(1);
        when(piston.judge(eq("PYTHON"), eq("print(input())"), anyList(), anyInt(), anyInt())).thenAnswer(call -> {
            judging.countDown();
            assertTrue(providerReady.await(15, TimeUnit.SECONDS));
            List<PistonClient.CaseInput> cases = call.getArgument(2);
            return cases.stream().map(test -> new PistonClient.CaseOutcome(test.testCaseId(), true, "x", null, null, 1)).toList();
        });
        var executor = Executors.newSingleThreadExecutor();
        try {
            var request = new CodeExamRequests.Submit(examId,
                    List.of(new CodeExamRequests.Answer(questionId, "PYTHON", "print(input())")));
            var submitted = executor.submit(() -> codeExams.submit(studentId, request));
            assertTrue(judging.await(10, TimeUnit.SECONDS));
            tx.executeWithoutResult(status -> em.find(ExamAttempt.class, attemptId)
                    .setDeadlineAt(Instant.now().minusSeconds(10)));
            assertEquals(Boolean.TRUE, tx.execute(status ->
                    autoSubmitter.isExpired(em.find(ExamAttempt.class, attemptId), Instant.now())));

            autoSubmitter.closeExpiredCodeAttempts();
            assertEquals(1L, activeAttempts());
            providerReady.countDown();
            assertEquals("PASSED", submitted.get(15, TimeUnit.SECONDS).results().get(0).status());

            autoSubmitter.closeExpiredCodeAttempts();
            assertEquals("COMPLETED", db.queryForObject("SELECT status FROM exam_attempts WHERE attempt_id = ?",
                    String.class, attemptId));
            assertEquals("PYTHON", db.queryForObject(
                    "SELECT response ->> 'language' FROM attempt_answers WHERE attempt_id = ? AND question_id = ?",
                    String.class, attemptId, questionId));
            assertEquals(1, db.queryForObject("SELECT count(*) FROM code_submissions WHERE attempt_id = ?",
                    Integer.class, attemptId));
            assertEquals(attemptId, codeExams.submissions(studentId, examId, null, 0, 10).getContent().get(0).attemptId());
            assertEquals(1L, codeExams.submissions(studentId, examId, attemptId, 0, 10).getTotalElements());
        } finally {
            providerReady.countDown();
            executor.shutdownNow();
            assertTrue(executor.awaitTermination(15, TimeUnit.SECONDS));
        }
    }

    private void insertActive(Instant now) {
        db.update("INSERT INTO exam_attempts(exam_id,user_id,start_time,deadline_at,status,auto_submitted) "
                        + "VALUES (?,?,?,?, 'IN_PROGRESS', false)",
                examId, studentId, Timestamp.from(now), Timestamp.from(now.plusSeconds(3600)));
    }

    private long activeAttempts() {
        Long count = db.queryForObject("SELECT count(*) FROM exam_attempts "
                        + "WHERE user_id = ? AND exam_id = ? AND status = 'IN_PROGRESS'",
                Long.class, studentId, examId);
        return count == null ? 0 : count;
    }

    private MvcResult start() throws Exception {
        return mvc.perform(post("/api/v1/student/exams/" + examId + "/attempts")
                .with(user(UserPrincipal.create(studentId, "student@example.com", User.ROLE_STUDENT)))).andReturn();
    }

    private List<MvcResult> concurrently(Callable<MvcResult> first, Callable<MvcResult> second) throws Exception {
        var executor = Executors.newFixedThreadPool(2);
        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch start = new CountDownLatch(1);
        try {
            List<Callable<MvcResult>> actions = new ArrayList<>(List.of(first, second));
            var futures = actions.stream().map(action -> executor.submit(() -> {
                ready.countDown();
                if (!start.await(10, TimeUnit.SECONDS)) {
                    throw new IllegalStateException("Concurrent request did not start");
                }
                return action.call();
            })).toList();
            assertTrue(ready.await(10, TimeUnit.SECONDS));
            start.countDown();
            return List.of(futures.get(0).get(30, TimeUnit.SECONDS), futures.get(1).get(30, TimeUnit.SECONDS));
        } finally {
            start.countDown();
            executor.shutdownNow();
            assertTrue(executor.awaitTermination(10, TimeUnit.SECONDS));
        }
    }
}
