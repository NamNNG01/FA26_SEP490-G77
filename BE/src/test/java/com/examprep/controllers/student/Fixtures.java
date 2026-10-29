package com.examprep.controllers.student;

import com.examprep.entities.*;
import com.examprep.entities.Module;
import com.examprep.security.UserPrincipal;
import jakarta.persistence.EntityManager;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import java.math.BigDecimal;
import java.sql.Connection;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;

/** Entity builders shared by Long's Part 2 / contest integration tests (H2). */
public final class Fixtures {
    private final EntityManager em;

    public Fixtures(EntityManager em) { this.em = em; }

    /** H2 stand-in for Postgres' pg_advisory_xact_lock. */
    public static Integer advisoryLock(Long key) { return 0; }

    public static void aliasAdvisoryLock(Connection c) throws Exception {
        c.createStatement().execute("CREATE ALIAS IF NOT EXISTS pg_advisory_xact_lock FOR '" + Fixtures.class.getName() + ".advisoryLock'");
    }

    public static RequestPostProcessor as(User u) { return user(UserPrincipal.create(u)); }

    public User account(String role) {
        User value = User.builder().email(UUID.randomUUID() + "@example.com").fullName(role + " user").passwordHash("test-hash").roleName(role).build();
        em.persist(value);
        return value;
    }

    public Course course(User manager) {
        Category category = Category.builder().name("Cat").slug(UUID.randomUUID().toString()).build();
        em.persist(category);
        Course course = Course.builder().categoryId(category.getCategoryId()).category(category).manager(manager).title("Java basics")
                .slug(UUID.randomUUID().toString()).isPublished(true).build();
        em.persist(course);
        return course;
    }

    public Module module(Course course, String title) {
        Module module = Module.builder().course(course).title(title).orderIndex(1).build();
        em.persist(module);
        return module;
    }

    public Enrollment enroll(User student, Course course) {
        Enrollment e = Enrollment.builder().course(course).user(student).status(Enrollment.STATUS_ACTIVE).enrolledAt(Instant.now()).build();
        em.persist(e);
        return e;
    }

    public Exam exam(Course course, Module module, User author, String mode) {
        Exam exam = Exam.builder().course(course).module(module).createdBy(author).title("Exam " + mode).durationMinutes(30)
                .isPractice(!"EXAM".equals(mode)).generationType("MANUAL").maxScore(new BigDecimal("10")).status("PUBLISHED")
                .mode(mode).publishedAt(Instant.now()).build();
        em.persist(exam);
        return exam;
    }

    /** ACTIVE + APPROVED single-choice question with two options (second one correct). */
    public Question question(Course course, Module module, String difficulty) {
        Question q = Question.builder().course(course).module(module).questionType("SINGLE_CHOICE").difficulty(difficulty)
                .content("Question " + UUID.randomUUID()).build();
        em.persist(q);
        em.persist(AnswerOption.builder().question(q).optionText("wrong").isCorrect(false).orderIndex(1).build());
        em.persist(AnswerOption.builder().question(q).optionText("right").isCorrect(true).orderIndex(2).build());
        return q;
    }

    public ExamAttempt finishedAttempt(Exam exam, User student, Instant submittedAt, String score) {
        ExamAttempt a = ExamAttempt.builder().exam(exam).user(student).startTime(submittedAt.minus(20, ChronoUnit.MINUTES))
                .deadlineAt(submittedAt.plus(10, ChronoUnit.MINUTES)).submittedAt(submittedAt).submitTime(submittedAt)
                .status("SUBMITTED").examSnapshot("{\"maxScore\":10,\"title\":\"x\"}")
                .totalScore(score == null ? null : new BigDecimal(score)).build();
        em.persist(a);
        return a;
    }

    /** One answered row with snapshots shaped like AttemptPaperFactory writes them. */
    public AttemptAnswer answer(ExamAttempt attempt, Question q, boolean correct) {
        String display = "{\"content\":\"" + q.getContent() + "\",\"questionType\":\"SINGLE_CHOICE\","
                + "\"options\":[{\"optionId\":1,\"optionText\":\"wrong\"},{\"optionId\":2,\"optionText\":\"right\"}]}";
        AttemptAnswer a = AttemptAnswer.builder().attempt(attempt).question(q).weightSnapshot(BigDecimal.ONE)
                .displaySnapshot(display).keySnapshot("{\"correctOptionIds\":[2]}")
                .response("{\"selectedOptionIds\":[" + (correct ? 2 : 1) + "]}").gradingStatus("AUTO").isCorrect(correct)
                .scoreEarned(correct ? BigDecimal.ONE : BigDecimal.ZERO).questionVersion(q.getScoringVersion()).build();
        em.persist(a);
        return a;
    }

    public <T> T reload(T entity) { em.flush(); em.refresh(entity); return entity; }
}
