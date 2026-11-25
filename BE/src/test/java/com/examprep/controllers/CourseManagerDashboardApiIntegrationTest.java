package com.examprep.controllers;

import com.examprep.entities.Category;
import com.examprep.entities.Course;
import com.examprep.entities.CourseManager;
import com.examprep.entities.Enrollment;
import com.examprep.entities.Exam;
import com.examprep.entities.ExamAttempt;
import com.examprep.entities.User;
import com.examprep.security.UserPrincipal;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * DASH-05: the Course Manager dashboard is scoped to the courses the caller manages (owner or
 * co-manager) and the course exams they created, and grades by percentage of each attempt's own
 * frozen max score.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class CourseManagerDashboardApiIntegrationTest {

    private static final String SUMMARY = "/api/v1/dashboard/course-manager/summary";
    private static final String COURSES = "/api/v1/dashboard/course-manager/courses";
    private static final String EXAMS = "/api/v1/dashboard/course-manager/exams";

    @Autowired MockMvc mvc;
    @Autowired EntityManager em;
    @Autowired ObjectMapper json;

    User manager;
    User coManager;
    User otherManager;
    Course mine;
    Course coManaged;
    Course foreign;
    Exam passing;
    Exam empty;

    @BeforeEach
    void fixtures() {
        manager = account(User.ROLE_COURSE_MANAGER);
        coManager = account(User.ROLE_COURSE_MANAGER);
        otherManager = account(User.ROLE_COURSE_MANAGER);
        User first = account(User.ROLE_STUDENT);
        User second = account(User.ROLE_STUDENT);

        // `manager` owns `mine`, co-manages `coManaged`, and has nothing to do with `foreign`.
        mine = course(manager, "Java basics", true);
        coManaged = course(otherManager, "Data structures", true);
        foreign = course(otherManager, "Networking", true);
        em.persist(CourseManager.builder().course(coManaged).user(manager).build());
        enroll(mine, first);
        enroll(mine, second);
        enroll(coManaged, first);

        // Published exam, 3 graded attempts at 30% and one still waiting for grading.
        passing = exam(manager, mine, "Midterm Java", "PUBLISHED", "EXAM", "10");
        attempt(passing, first, "COMPLETED", "3.00", "10", now(1), 30);
        attempt(passing, second, "COMPLETED", "3.00", "10", now(2), 30);
        attempt(passing, first, "COMPLETED", "3.00", "10", now(10), 30);
        attempt(passing, second, "SUBMITTED", "1.00", "10", now(2), 30);

        // Draft exam with 10 graded attempts at 90%; snapshot says max 10 while the live exam says 20.
        Exam co = exam(manager, coManaged, "Graphs quiz", "DRAFT", "EXAM", "20");
        for (int i = 0; i < 10; i++) {
            attempt(co, first, "COMPLETED", "9.00", "10", now(3), 45);
        }

        // Archived exam without a single submission.
        empty = exam(manager, mine, "Old final", "ARCHIVED", "EXAM", "10");

        // Never counted: a practice exam, another manager's exam, and an exam in a course outside the scope.
        Exam practice = exam(manager, mine, "Practice drill", "PUBLISHED", "PRACTICE", "10");
        attempt(practice, first, "COMPLETED", "10.00", "10", now(1), 5);
        Exam theirs = exam(otherManager, foreign, "Their midterm", "PUBLISHED", "EXAM", "10");
        attempt(theirs, first, "COMPLETED", "10.00", "10", now(1), 20);
        Exam orphan = exam(manager, foreign, "Not my course", "PUBLISHED", "EXAM", "10");
        attempt(orphan, first, "COMPLETED", "10.00", "10", now(1), 20);
    }

    @Test
    void summaryCountsOnlyMyCoursesAndMyExams() throws Exception {
        JsonNode data = data(call(manager, get(SUMMARY)).andExpect(status().isOk()));

        assertEquals(2, data.path("managedCourses").asLong());
        // Two distinct students: one is enrolled in both managed courses.
        assertEquals(2, data.path("activeStudents").asLong());
        JsonNode exams = data.path("myExams");
        assertEquals(3, exams.path("total").asLong());
        assertEquals(1, exams.path("published").asLong());
        assertEquals(1, exams.path("draft").asLong());
        assertEquals(1, exams.path("archived").asLong());

        // 3 graded at 30% + 10 graded at 90% → 990/13 = 76.2; pass = 10/13 = 76.9.
        assertEquals(0, new BigDecimal("76.2").compareTo(data.path("avgScore").decimalValue()));
        assertEquals(0, new BigDecimal("76.9").compareTo(data.path("passRate").decimalValue()));
        // Recent submissions: two graded + the pending one of `passing`, plus the ten of the draft exam.
        assertEquals(13, data.path("submittedAttempts7d").asLong());
        assertEquals(1, data.path("pendingGrading").asLong());
    }

    @Test
    void coursePanelCarriesActiveStudentsExamsAndScoresLowestPassRateFirst() throws Exception {
        JsonNode rows = data(call(manager, get(COURSES)).andExpect(status().isOk()));
        assertEquals(2, rows.size());

        JsonNode low = rows.get(0);
        assertEquals(mine.getCourseId(), low.path("courseId").asLong());
        assertEquals("Java basics", low.path("title").asText());
        assertEquals(2, low.path("activeStudents").asLong());
        assertEquals(2, low.path("myExamCount").asLong());
        assertEquals(4, low.path("submittedAttempts").asLong());
        assertEquals(0, new BigDecimal("30.0").compareTo(low.path("avgScore").decimalValue()));
        assertEquals(0, BigDecimal.ZERO.compareTo(low.path("passRate").decimalValue()));

        JsonNode high = rows.get(1);
        assertEquals(coManaged.getCourseId(), high.path("courseId").asLong());
        assertEquals(1, high.path("activeStudents").asLong());
        assertEquals(1, high.path("myExamCount").asLong());
        assertEquals(10, high.path("submittedAttempts").asLong());
        assertEquals(0, new BigDecimal("90.0").compareTo(high.path("avgScore").decimalValue()));
        assertEquals(0, new BigDecimal("100.0").compareTo(high.path("passRate").decimalValue()));
    }

    @Test
    void examPanelRanksThinDataLastAndUsesTheFrozenMaxScore() throws Exception {
        // Default minAttempts = 5: the well-measured exam leads, the thin one follows by pass rate.
        JsonNode rows = data(call(manager, get(EXAMS)).andExpect(status().isOk()));
        assertEquals(3, rows.size());

        JsonNode drafts = rows.get(0);
        assertEquals("Graphs quiz", drafts.path("title").asText());
        assertEquals("DRAFT", drafts.path("status").asText());
        assertEquals("Data structures", drafts.path("courseTitle").asText());
        assertEquals(10, drafts.path("submittedAttempts").asLong());
        // 9/10 (the frozen snapshot) = 90%, not 9/20 (the live exam) = 45%.
        assertEquals(0, new BigDecimal("90.0").compareTo(drafts.path("avgScore").decimalValue()));
        assertEquals(0, new BigDecimal("100.0").compareTo(drafts.path("passRate").decimalValue()));
        assertEquals(45, drafts.path("avgDurationMinutes").asInt());

        JsonNode midterm = rows.get(1);
        assertEquals(passing.getExamId(), midterm.path("examId").asLong());
        assertEquals(4, midterm.path("submittedAttempts").asLong());
        assertEquals(0, new BigDecimal("30.0").compareTo(midterm.path("avgScore").decimalValue()));
        assertEquals(0, BigDecimal.ZERO.compareTo(midterm.path("passRate").decimalValue()));
        assertEquals(30, midterm.path("avgDurationMinutes").asInt());
        assertEquals(1, midterm.path("pendingGrading").asLong());

        JsonNode archived = rows.get(2);
        assertEquals(empty.getExamId(), archived.path("examId").asLong());
        assertEquals("ARCHIVED", archived.path("status").asText());
        assertEquals(0, archived.path("submittedAttempts").asLong());
        assertTrue(archived.path("avgScore").isMissingNode() || archived.path("avgScore").isNull());
        assertTrue(archived.path("passRate").isMissingNode() || archived.path("passRate").isNull());
        assertTrue(archived.path("avgDurationMinutes").isMissingNode() || archived.path("avgDurationMinutes").isNull());
        assertEquals(0, archived.path("pendingGrading").asLong());

        // Lowering the threshold re-ranks: both measured exams leave the thin bucket, so the
        // lowest pass rate (the midterm) comes first again.
        JsonNode near = data(call(manager, get(EXAMS).param("minAttempts", "1")).andExpect(status().isOk()));
        assertEquals(passing.getExamId(), near.get(0).path("examId").asLong());
        assertEquals("Graphs quiz", near.get(1).path("title").asText());
        assertEquals(empty.getExamId(), near.get(2).path("examId").asLong());
    }

    @Test
    void examPanelFiltersByManagedCourseAndRefusesUnknownThresholds() throws Exception {
        JsonNode rows = data(call(manager, get(EXAMS).param("courseId", String.valueOf(mine.getCourseId())))
                .andExpect(status().isOk()));
        assertEquals(2, rows.size());
        for (JsonNode row : rows) {
            assertEquals(mine.getCourseId(), row.path("courseId").asLong());
        }

        // A course outside the caller's scope filters to nothing instead of leaking another manager's exams.
        JsonNode foreignRows = data(call(manager, get(EXAMS).param("courseId", String.valueOf(foreign.getCourseId())))
                .andExpect(status().isOk()));
        assertEquals(0, foreignRows.size());

        call(manager, get(EXAMS).param("minAttempts", "0")).andExpect(status().isBadRequest());
        call(manager, get(EXAMS).param("minAttempts", "101")).andExpect(status().isBadRequest());
    }

    @Test
    void anotherManagerOnlySeesTheirOwnScope() throws Exception {
        JsonNode summary = data(call(otherManager, get(SUMMARY)).andExpect(status().isOk()));
        // They own both `coManaged` (where the other manager is only a co-manager) and `foreign`.
        assertEquals(2, summary.path("managedCourses").asLong());
        assertEquals(1, summary.path("myExams").path("total").asLong());
        assertEquals(1, summary.path("myExams").path("published").asLong());
        assertEquals(0, summary.path("myExams").path("draft").asLong());
        assertEquals(0, summary.path("myExams").path("archived").asLong());
        assertEquals(1, summary.path("submittedAttempts7d").asLong());
        assertEquals(0, new BigDecimal("100.0").compareTo(summary.path("avgScore").decimalValue()));

        JsonNode courses = data(call(otherManager, get(COURSES)).andExpect(status().isOk()));
        assertEquals(2, courses.size(), "the owner manages two courses, one of them also co-managed by someone else");

        // Their only exam is the one they created; the co-manager's course exam stays invisible.
        JsonNode exams = data(call(otherManager, get(EXAMS)).andExpect(status().isOk()));
        List<Long> ids = new ArrayList<>();
        exams.forEach(row -> ids.add(row.path("examId").asLong()));
        assertEquals(1, ids.size(), "only the exam they created");
        assertFalse(ids.contains(passing.getExamId()));
    }

    @Test
    void theEndpointsRequireAManagerOrAdmin() throws Exception {
        for (String url : List.of(SUMMARY, COURSES, EXAMS)) {
            mvc.perform(get(url)).andExpect(status().isUnauthorized());
            call(account(User.ROLE_STUDENT), get(url)).andExpect(status().isForbidden());
            call(account(User.ROLE_ADMIN), get(url)).andExpect(status().isForbidden());
        }
    }

    // =================================================================================
    // fixtures
    // =================================================================================

    private Instant now(int daysAgo) {
        return Instant.now().minus(daysAgo, ChronoUnit.DAYS);
    }

    private User account(String role) {
        User user = User.builder().email(UUID.randomUUID() + "@example.com").fullName(role + " user")
                .passwordHash("test").roleName(role).build();
        em.persist(user);
        return user;
    }

    private Course course(User owner, String title, boolean published) {
        Category category = Category.builder().name("Category " + UUID.randomUUID()).slug(UUID.randomUUID().toString()).build();
        em.persist(category);
        Course course = Course.builder().categoryId(category.getCategoryId()).category(category).manager(owner)
                .title(title).slug(UUID.randomUUID().toString()).price(BigDecimal.ZERO).isPublished(published).build();
        em.persist(course);
        return course;
    }

    private void enroll(Course course, User student) {
        em.persist(Enrollment.builder().course(course).user(student).status(Enrollment.STATUS_ACTIVE)
                .enrolledAt(Instant.now()).build());
    }

    private Exam exam(User author, Course course, String title, String status, String mode, String maxScore) {
        Exam exam = Exam.builder().course(course).createdBy(author).title(title).durationMinutes(60)
                .generationType("STATIC").isPractice(!"EXAM".equals(mode)).maxScore(new BigDecimal(maxScore))
                .status(status).mode(mode).publishedAt("PUBLISHED".equals(status) ? Instant.now() : null)
                .build();
        em.persist(exam);
        return exam;
    }

    /** One submitted attempt with a frozen {@code exam_snapshot} max score of its own. */
    private void attempt(Exam exam, User student, String status, String totalScore, String snapshotMaxScore,
                         Instant submittedAt, int minutes) {
        em.persist(ExamAttempt.builder()
                .exam(exam).user(student)
                .startTime(submittedAt.minus(minutes, ChronoUnit.MINUTES))
                .deadlineAt(submittedAt.plus(30, ChronoUnit.MINUTES))
                .submittedAt(submittedAt).submitTime(submittedAt)
                .status(status).mode("EXAM")
                .examSnapshot("{\"maxScore\":" + snapshotMaxScore + ",\"title\":\"" + exam.getTitle() + "\"}")
                .totalScore(new BigDecimal(totalScore))
                .build());
    }

    private ResultActions call(User actor, MockHttpServletRequestBuilder request) throws Exception {
        em.flush();
        return mvc.perform(request.with(user(UserPrincipal.create(actor))));
    }

    private JsonNode data(ResultActions actions) throws Exception {
        return json.readTree(actions.andReturn().getResponse().getContentAsString()).path("data");
    }
}
