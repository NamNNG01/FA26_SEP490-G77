package com.examprep.controllers;

import com.examprep.entities.*;
import com.examprep.security.UserPrincipal;
import com.examprep.services.MaterialStorage;
import com.examprep.services.MaterialTextReader;
import com.examprep.services.QuizGenerationWorker;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import javax.sql.DataSource;
import java.math.BigDecimal;
import java.sql.Connection;
import java.time.Instant;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * MQ-05 commit-boundary regression test: the second "start" of a material quiz resumes the
 * in-progress attempt. It deliberately runs <strong>without</strong> a test transaction, because
 * catching {@code ATTEMPT_IN_PROGRESS} across a transactional boundary only breaks at commit time
 * (a rollback-only outer transaction throws {@code UnexpectedRollbackException} → 500). A
 * {@code @Transactional} test would roll back regardless and hide the defect.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
public class StudentMaterialQuizResumeCommitTest {

    @DynamicPropertySource
    static void isolatedContext(DynamicPropertyRegistry registry) {
        // Unique property value → dedicated context and H2 database, no committed leftovers leak
        // into the transactional suites. Also parks the worker sweep.
        registry.add("app.material-ai.sweep-ms", () -> 3_600_000);
    }

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired EntityManager em;
    @Autowired PlatformTransactionManager transactionManager;
    @Autowired DataSource dataSource;
    @MockBean MaterialStorage storage;
    @MockBean MaterialTextReader reader;
    @MockBean QuizGenerationWorker worker;

    public static Integer advisoryLock(Long key) { return 0; }

    TransactionTemplate tx;
    User student;
    Long jobId;
    Long examId;

    @BeforeEach
    void seed() throws Exception {
        try (Connection connection = dataSource.getConnection()) {
            connection.createStatement().execute("CREATE ALIAS IF NOT EXISTS pg_advisory_xact_lock FOR '"
                    + StudentMaterialQuizResumeCommitTest.class.getName() + ".advisoryLock'");
        }
        tx = new TransactionTemplate(transactionManager);
        tx.executeWithoutResult(status -> {
            User manager = account(User.ROLE_COURSE_MANAGER);
            student = account(User.ROLE_STUDENT);
            Category category = Category.builder().name("Resume").slug(UUID.randomUUID().toString()).build();
            em.persist(category);
            Course course = Course.builder().categoryId(category.getCategoryId()).category(category)
                    .manager(manager).title("Java OOP").slug(UUID.randomUUID().toString())
                    .price(BigDecimal.ZERO).isPublished(true).build();
            em.persist(course);
            em.persist(Enrollment.builder().course(course).user(student).enrolledAt(Instant.now())
                    .status(Enrollment.STATUS_ACTIVE).build());
            Exam exam = Exam.builder().course(course).createdBy(manager).title("Material quiz")
                    .durationMinutes(10).isPractice(true).generationType("STATIC")
                    .maxScore(new BigDecimal("2")).status("PUBLISHED").publishedAt(Instant.now()).build();
            em.persist(exam);
            examId = exam.getExamId();
            for (int i = 1; i <= 2; i++) {
                Question question = Question.builder().course(course).createdBy(manager)
                        .questionType("SINGLE_CHOICE").difficulty("EASY").content("Question " + i).build();
                em.persist(question);
                for (int option = 1; option <= 4; option++) {
                    em.persist(AnswerOption.builder().question(question).optionText("Option " + option)
                            .isCorrect(option == 1).orderIndex(option).build());
                }
                em.persist(ExamQuestion.builder().exam(exam).question(question)
                        .weight(BigDecimal.ONE).orderIndex(i).build());
            }
            Document document = Document.builder().user(student)
                    .courses(new java.util.LinkedHashSet<>(java.util.Set.of(course))).generationType("MATERIAL")
                    .extractedContent("Material text").status("UPLOADED").title("Week 1")
                    .fileName("week1.docx").fileUrl("https://cdn.test/week1.docx").fileSizeKb(1)
                    .pageCount(1).createdAt(Instant.now()).build();
            em.persist(document);
            QuizGenerationJob job = QuizGenerationJob.builder().user(student).document(document)
                    .course(course).questionCount(2).difficulty("MEDIUM")
                    .status(QuizGenerationWorker.STATUS_COMPLETED).progress(100).resultExam(exam)
                    .createdAt(Instant.now()).updatedAt(Instant.now()).build();
            em.persist(job);
            jobId = job.getJobId();
        });
    }

    @Test
    void resumingAStartedMaterialQuizCommitsTheModeAndReturnsTheSameAttempt() throws Exception {
        String path = "/api/v1/student/materials/quiz-jobs/" + jobId + "/start";

        String firstBody = mvc.perform(post(path).with(user(UserPrincipal.create(student))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.questions.length()").value(2))
                .andReturn().getResponse().getContentAsString();
        long attemptId = json.readTree(firstBody).path("data").path("attemptId").asLong();

        // Second start: the attempt service rejects the duplicate with ATTEMPT_IN_PROGRESS and the
        // service resumes it. With an outer transaction this response would be a 500.
        String resumedBody = mvc.perform(post(path).with(user(UserPrincipal.create(student))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.questions.length()").value(2))
                .andReturn().getResponse().getContentAsString();
        assertEquals(attemptId, json.readTree(resumedBody).path("data").path("attemptId").asLong());

        tx.executeWithoutResult(status -> {
            em.clear();
            ExamAttempt attempt = em.find(ExamAttempt.class, attemptId);
            assertNotNull(attempt);
            assertEquals("MATERIAL_QUIZ", attempt.getMode());
            assertEquals("IN_PROGRESS", attempt.getStatus());
            assertEquals(1L, em.createQuery(
                            "select count(a) from ExamAttempt a where a.exam.examId = :exam and a.user.userId = :user",
                            Long.class)
                    .setParameter("exam", examId).setParameter("user", student.getUserId()).getSingleResult());
            assertEquals(2L, em.createQuery(
                            "select count(x) from AttemptAnswer x where x.attempt.attemptId = :id", Long.class)
                    .setParameter("id", attemptId).getSingleResult());
        });
    }

    private User account(String role) {
        User user = User.builder().email(UUID.randomUUID() + "@example.com").fullName(role)
                .passwordHash("test").roleName(role).build();
        em.persist(user);
        return user;
    }
}
