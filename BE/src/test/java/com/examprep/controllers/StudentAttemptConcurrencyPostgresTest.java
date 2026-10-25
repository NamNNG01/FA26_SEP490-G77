package com.examprep.controllers;

import com.examprep.entities.AnswerOption;
import com.examprep.entities.Category;
import com.examprep.entities.Course;
import com.examprep.entities.Enrollment;
import com.examprep.entities.Exam;
import com.examprep.entities.ExamQuestion;
import com.examprep.entities.Module;
import com.examprep.entities.Question;
import com.examprep.entities.User;
import com.examprep.security.UserPrincipal;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
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
