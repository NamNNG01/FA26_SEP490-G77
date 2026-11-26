package com.examprep.controllers.student;

import com.examprep.entities.*;
import com.examprep.entities.Module;
import com.examprep.security.UserPrincipal;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;
import java.util.List;
import org.hibernate.SessionFactory;
import com.examprep.services.student.StudentCourseService;
import com.examprep.services.student.StudentProgressService;
import static org.junit.jupiter.api.Assertions.*;

import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.not;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class StudentCourseApiIntegrationTest {

    @Autowired
    private MockMvc mvc;

    @Autowired
    private ObjectMapper json;

    @Autowired
    private EntityManager em;

    @Autowired private StudentCourseService courseService;
    @Autowired private StudentProgressService progressService;

    private User student;
    private User manager;
    private Course publishedCourse;
    private Enrollment enrollment;

    @BeforeEach
    void setup() {
        student = User.builder().email("student_" + UUID.randomUUID() + "@examprep.local").fullName("Student Test").passwordHash("hash").roleName("STUDENT").build();
        manager = User.builder().email("manager_" + UUID.randomUUID() + "@examprep.local").fullName("Manager Test").passwordHash("hash").roleName("COURSE_MANAGER").build();
        em.persist(student);
        em.persist(manager);

        Category category = Category.builder().name("Tech").slug("tech-" + UUID.randomUUID()).code("TECH-" + UUID.randomUUID()).build();
        em.persist(category);

        publishedCourse = Course.builder()
                .title("Advanced Java")
                .slug("advanced-java-" + UUID.randomUUID())
                .categoryId(category.getCategoryId())
                .category(category)
                .manager(manager)
                .isPublished(true)
                .price(BigDecimal.ZERO)
                .build();
        em.persist(publishedCourse);

        Module module = Module.builder().course(publishedCourse).title("Intro").orderIndex(1).status("VISIBLE").build();
        em.persist(module);

        Exam exam = Exam.builder()
                .course(publishedCourse)
                .createdBy(manager)
                .title("Java Quiz")
                .durationMinutes(30)
                .isPractice(false)
                .generationType("FIXED")
                .maxScore(BigDecimal.TEN)
                .status("PUBLISHED")
                .publishedAt(Instant.now())
                .build();
        em.persist(exam);

        Deck deck = Deck.builder().course(publishedCourse).user(manager).title("Java Flashcards").isPublic(true).build();
        em.persist(deck);

        Flashcard card = Flashcard.builder().deck(deck).frontText("What is OOP?").backText("Object Oriented Programming").build();
        em.persist(card);

        enrollment = Enrollment.builder()
                .course(publishedCourse)
                .user(student)
                .enrolledAt(Instant.now())
                .status("ACTIVE")
                .progress(25)
                .build();
        em.persist(enrollment);
        em.flush();
    }

    @Test
    void listCourses_PublicCatalog() throws Exception {
        mvc.perform(get("/api/v1/student/courses"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.content[0].courseId").value(publishedCourse.getCourseId()))
                .andExpect(jsonPath("$.data.content[0].title").value("Advanced Java"))
                .andExpect(jsonPath("$.data.content[0].publishedExamCount").value(1))
                .andExpect(jsonPath("$.data.content[0].deckCount").value(1));
    }

    @Test
    void getCourseDetail_Success() throws Exception {
        mvc.perform(get("/api/v1/student/courses/" + publishedCourse.getCourseId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.courseId").value(publishedCourse.getCourseId()))
                .andExpect(jsonPath("$.data.modules[0].title").value("Intro"))
                .andExpect(jsonPath("$.data.modules[0].questionCount").value(0))
                .andExpect(jsonPath("$.data.stats.questionCount").value(0))
                .andExpect(jsonPath("$.data.enrollment.isEnrolled").value(false));
    }

    @Test
    void getCourseDetail_IncludesPublicQuestionCountsForQuestionOnlyModules() throws Exception {
        Course questionsOnlyCourse = Course.builder()
                .title("Course Test 23/11")
                .slug("course-test-23-11-" + UUID.randomUUID())
                .categoryId(publishedCourse.getCategoryId())
                .category(publishedCourse.getCategory())
                .manager(manager)
                .isPublished(true)
                .price(new BigDecimal("120000"))
                .build();
        em.persist(questionsOnlyCourse);

        Module visibleMod = Module.builder().course(questionsOnlyCourse).title("Module 1").orderIndex(1).status("VISIBLE").build();
        Module hiddenMod = Module.builder().course(questionsOnlyCourse).title("Hidden Module").orderIndex(2).status("HIDDEN").build();
        em.persist(visibleMod);
        em.persist(hiddenMod);

        em.persist(Question.builder().course(questionsOnlyCourse).module(visibleMod)
                .questionType("SINGLE_CHOICE").content("Visible Active 1").status("ACTIVE").approvalStatus("APPROVED").build());
        em.persist(Question.builder().course(questionsOnlyCourse).module(visibleMod)
                .questionType("SINGLE_CHOICE").content("Visible Active 2").status("ACTIVE").approvalStatus("APPROVED").build());
        em.persist(Question.builder().course(questionsOnlyCourse).module(visibleMod)
                .questionType("SINGLE_CHOICE").content("Visible Draft").status("INACTIVE").approvalStatus("APPROVED").build());
        em.persist(Question.builder().course(questionsOnlyCourse).module(hiddenMod)
                .questionType("SINGLE_CHOICE").content("Hidden Active").status("ACTIVE").approvalStatus("APPROVED").build());
        em.flush();

        mvc.perform(get("/api/v1/student/courses/" + questionsOnlyCourse.getCourseId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.modules.length()").value(1))
                .andExpect(jsonPath("$.data.modules[0].title").value("Module 1"))
                .andExpect(jsonPath("$.data.modules[0].questionCount").value(2))
                .andExpect(jsonPath("$.data.stats.publishedExamCount").value(0))
                .andExpect(jsonPath("$.data.stats.deckCount").value(0))
                .andExpect(jsonPath("$.data.stats.questionCount").value(2));
    }

    @Test
    void listMyCourses_EnrolledStudent() throws Exception {
        mvc.perform(get("/api/v1/student/my-courses").with(user(UserPrincipal.create(student))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.content[0].courseId").value(publishedCourse.getCourseId()))
                .andExpect(jsonPath("$.data.content[0].progress").value(25));
    }

    @Test
    void courseListProgressUsesFixedQueryCountAndDoesNotWriteEnrollments() {
        var statistics = em.getEntityManagerFactory().unwrap(SessionFactory.class).getStatistics();
        statistics.setStatisticsEnabled(true);
        try {
            em.clear();
            statistics.clear();
            courseService.listMyCourses(null, 0, 100, student.getUserId());
            long oneCourseQueries = statistics.getPrepareStatementCount();

            for (int i = 0; i < 8; i++) {
                Course extra = Course.builder().categoryId(publishedCourse.getCategoryId()).manager(manager)
                        .title("Extra " + i).slug(UUID.randomUUID().toString()).isPublished(true).build();
                em.persist(extra);
                em.persist(Enrollment.builder().course(extra).user(student).enrolledAt(Instant.now())
                        .status("ACTIVE").progress(17).build());
                for (int j = 0; j < 3; j++) {
                    em.persist(Module.builder().course(extra).title("Module " + j).status("VISIBLE").orderIndex(j).build());
                }
            }
            em.flush();
            em.clear();
            statistics.clear();
            var page = courseService.listMyCourses(null, 0, 100, student.getUserId());
            assertEquals(9, page.getNumberOfElements());
            assertEquals(oneCourseQueries, statistics.getPrepareStatementCount());
            assertTrue(oneCourseQueries <= 7, "Page should need only list/count plus five progress summaries");
            assertEquals(0, statistics.getEntityUpdateCount());
            assertEquals(17, page.getContent().stream().filter(c -> c.title().startsWith("Extra")).findFirst().orElseThrow().progress());
        } finally {
            statistics.setStatisticsEnabled(false);
        }
    }

    @Test
    void moduleProgressCountsPracticeAndExamCorrectQuestionsWithoutDoubleCountingOrFlashcards() {
        Module visible = em.createQuery("from Module m where m.course = :course", Module.class)
                .setParameter("course", publishedCourse).getSingleResult();
        Module hidden = Module.builder().course(publishedCourse).title("Hidden").status("HIDDEN").orderIndex(2).build();
        em.persist(hidden);

        // Visible module: 3 questions -> q0 right in Practice + Exam (counts once), q1 right in Exam only, q2 unanswered -> 2/3 = 67%
        Question q0 = Question.builder().course(publishedCourse).module(visible)
                .questionType("SINGLE_CHOICE").content("Q0").status("ACTIVE").build();
        Question q1 = Question.builder().course(publishedCourse).module(visible)
                .questionType("SINGLE_CHOICE").content("Q1").status("ACTIVE").build();
        Question q2 = Question.builder().course(publishedCourse).module(visible)
                .questionType("SINGLE_CHOICE").content("Q2").status("ACTIVE").build();
        em.persist(q0);
        em.persist(q1);
        em.persist(q2);

        // General pool (module = null): 2 questions, 1 right in Practice -> 1/2 = 50%
        Question g0 = Question.builder().course(publishedCourse).module(null)
                .questionType("SINGLE_CHOICE").content("G0").status("ACTIVE").build();
        Question g1 = Question.builder().course(publishedCourse).module(null)
                .questionType("SINGLE_CHOICE").content("G1").status("ACTIVE").build();
        em.persist(g0);
        em.persist(g1);

        // Hidden module question should be excluded
        Question h0 = Question.builder().course(publishedCourse).module(hidden)
                .questionType("SINGLE_CHOICE").content("H0").status("ACTIVE").build();
        em.persist(h0);

        em.persist(QuestionPracticeProgress.builder().course(publishedCourse).module(visible)
                .user(student).question(q0).totalAttempts(1).gradedAttempts(1).correctAttempts(1).build());
        em.persist(QuestionPracticeProgress.builder().course(publishedCourse).module(null)
                .user(student).question(g0).totalAttempts(1).gradedAttempts(1).correctAttempts(1).build());

        Exam exam = em.createQuery("from Exam e where e.course = :course", Exam.class)
                .setParameter("course", publishedCourse).getSingleResult();
        ExamAttempt attempt = ExamAttempt.builder().exam(exam).user(student)
                .status("COMPLETED").startTime(Instant.now()).deadlineAt(Instant.now().plusSeconds(60))
                .submitTime(Instant.now()).totalScore(BigDecimal.TEN).build();
        em.persist(attempt);
        // q0 is right in both Practice and Exam -> must still only count once
        em.persist(AttemptAnswer.builder().attempt(attempt).question(q0).isCorrect(true).build());
        em.persist(AttemptAnswer.builder().attempt(attempt).question(q1).isCorrect(true).build());

        // Flashcard progress should not affect module progress
        Flashcard card = em.createQuery("from Flashcard f where f.deck.course = :course", Flashcard.class)
                .setParameter("course", publishedCourse).getSingleResult();
        em.persist(UserCardProgress.builder().user(student).card(card).isStarred(false).status("KNOWN").build());
        em.flush();
        em.clear();

        var dto = progressService.getCourseProgress(publishedCourse.getCourseId(), student.getUserId());
        var visibleDto = dto.getModules().stream()
                .filter(m -> visible.getModuleId().equals(m.getModuleId()))
                .findFirst().orElseThrow();
        assertEquals(67, visibleDto.getProgress());
        assertEquals(2L, visibleDto.getQuestions().getDone());
        assertEquals(3L, visibleDto.getQuestions().getTotal());
        assertNull(visibleDto.getExams());
        assertNull(visibleDto.getDecks());

        var generalDto = dto.getModules().stream()
                .filter(m -> m.getModuleId() == null)
                .findFirst().orElseThrow();
        assertEquals(50, generalDto.getProgress());
        assertEquals(1L, generalDto.getQuestions().getDone());
        assertEquals(2L, generalDto.getQuestions().getTotal());

        assertTrue(dto.getModules().stream().noneMatch(m -> hidden.getModuleId().equals(m.getModuleId())));
    }

    @Test
    void listCourseExams_Enrolled_ReturnsOk() throws Exception {
        mvc.perform(get("/api/v1/student/courses/" + publishedCourse.getCourseId() + "/exams").with(user(UserPrincipal.create(student))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.content[0].title").value("Java Quiz"));
    }

    @Test
    void listCourseExams_NotEnrolled_ReturnsForbidden() throws Exception {
        User otherStudent = User.builder().email("other_" + UUID.randomUUID() + "@examprep.local").fullName("Other").passwordHash("hash").roleName("STUDENT").build();
        em.persist(otherStudent);
        em.flush();

        mvc.perform(get("/api/v1/student/courses/" + publishedCourse.getCourseId() + "/exams").with(user(UserPrincipal.create(otherStudent))))
                .andExpect(status().isForbidden());
    }

    @Test
    void hiddenModule_HidesItsExamsFromStudents() throws Exception {
        Module hidden = Module.builder().course(publishedCourse).title("Draft chapter").orderIndex(2).status("HIDDEN").build();
        em.persist(hidden);
        Exam hiddenExam = Exam.builder().course(publishedCourse).module(hidden).createdBy(manager).title("Hidden Quiz")
                .durationMinutes(30).isPractice(false).generationType("FIXED").maxScore(BigDecimal.TEN)
                .status("PUBLISHED").publishedAt(Instant.now()).build();
        em.persist(hiddenExam);
        em.flush();
        UserPrincipal principal = UserPrincipal.create(student);

        mvc.perform(get("/api/v1/student/courses/" + publishedCourse.getCourseId() + "/exams").with(user(principal)))
                .andExpect(jsonPath("$.data.totalElements").value(1))
                .andExpect(jsonPath("$.data.content[0].title").value("Java Quiz"));
        mvc.perform(get("/api/v1/student/courses/" + publishedCourse.getCourseId()))
                .andExpect(jsonPath("$.data.modules.length()").value(1))
                .andExpect(jsonPath("$.data.stats.publishedExamCount").value(1));
        mvc.perform(get("/api/v1/student/courses")).andExpect(jsonPath("$.data.content[0].publishedExamCount").value(1));
        mvc.perform(get("/api/v1/student/my-courses").with(user(principal)))
                .andExpect(jsonPath("$.data.content[0].publishedExamCount").value(1));
        mvc.perform(get("/api/v1/student/exams/" + hiddenExam.getExamId()).with(user(principal))).andExpect(status().isNotFound());
    }

    @Test
    void listCourseDecks_Enrolled_ReturnsOk() throws Exception {
        mvc.perform(get("/api/v1/student/courses/" + publishedCourse.getCourseId() + "/decks").with(user(UserPrincipal.create(student))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data[0].title").value("Java Flashcards"));
    }

    @Test
    void listCategories_ReturnsOnlyActiveForStudents() throws Exception {
        Category visible = Category.builder().name("Visible Filter").slug("visible-filter-" + UUID.randomUUID())
                .code("VISIBLE-" + UUID.randomUUID()).build();
        Category inactive = Category.builder().name("Inactive Filter").slug("inactive-filter-" + UUID.randomUUID())
                .code("INACTIVE-" + UUID.randomUUID()).isActive(false).build();
        Category deleted = Category.builder().name("Deleted Filter").slug("deleted-filter-" + UUID.randomUUID())
                .code("DELETED-" + UUID.randomUUID()).isDeleted(true).build();
        em.persist(visible);
        em.persist(inactive);
        em.persist(deleted);
        em.flush();

        mvc.perform(get("/api/v1/student/categories").with(user(UserPrincipal.create(student))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data[*].categoryId", hasItem(visible.getCategoryId().intValue())))
                .andExpect(jsonPath("$.data[*].name", hasItem("Visible Filter")))
                .andExpect(jsonPath("$.data[*].name", not(hasItem("Inactive Filter"))))
                .andExpect(jsonPath("$.data[*].name", not(hasItem("Deleted Filter"))));
    }

    @Test
    void listCategories_AnonymousCatalogAccess_ReturnsOk() throws Exception {
        mvc.perform(get("/api/v1/student/categories"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true));
    }

    @Test
    void getModuleContent_General_ReturnsOk() throws Exception {
        Exam exam = em.createQuery("from Exam e where e.course = :course", Exam.class)
                .setParameter("course", publishedCourse).getSingleResult();
        exam.setModule(null);
        Deck deck = em.createQuery("from Deck d where d.course = :course", Deck.class)
                .setParameter("course", publishedCourse).getSingleResult();
        deck.setModule(null);
        em.flush();

        mvc.perform(get("/api/v1/student/courses/" + publishedCourse.getCourseId() + "/modules/general/content")
                        .with(user(UserPrincipal.create(student))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.module.moduleId").isEmpty())
                .andExpect(jsonPath("$.data.module.title").value("General"))
                .andExpect(jsonPath("$.data.exams[0].title").value("Java Quiz"))
                .andExpect(jsonPath("$.data.decks[0].title").value("Java Flashcards"));
    }

    @Test
    void getModuleContent_NumericModule_ReturnsOk() throws Exception {
        Module module = em.createQuery("from Module m where m.course = :course", Module.class)
                .setParameter("course", publishedCourse).getSingleResult();
        Exam exam = em.createQuery("from Exam e where e.course = :course", Exam.class)
                .setParameter("course", publishedCourse).getSingleResult();
        exam.setModule(module);
        Deck deck = em.createQuery("from Deck d where d.course = :course", Deck.class)
                .setParameter("course", publishedCourse).getSingleResult();
        deck.setModule(module);
        em.flush();

        mvc.perform(get("/api/v1/student/courses/" + publishedCourse.getCourseId() + "/modules/" + module.getModuleId() + "/content")
                        .with(user(UserPrincipal.create(student))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.module.moduleId").value(module.getModuleId()))
                .andExpect(jsonPath("$.data.module.title").value("Intro"))
                .andExpect(jsonPath("$.data.exams[0].title").value("Java Quiz"))
                .andExpect(jsonPath("$.data.decks[0].title").value("Java Flashcards"));
    }

    @Test
    void getModuleContent_InvalidOrHiddenModule_ReturnsNotFound() throws Exception {
        Module hidden = Module.builder().course(publishedCourse).title("Hidden").orderIndex(2).status("HIDDEN").build();
        em.persist(hidden);
        em.flush();

        mvc.perform(get("/api/v1/student/courses/" + publishedCourse.getCourseId() + "/modules/" + hidden.getModuleId() + "/content")
                        .with(user(UserPrincipal.create(student))))
                .andExpect(status().isNotFound());

        mvc.perform(get("/api/v1/student/courses/" + publishedCourse.getCourseId() + "/modules/999999/content")
                        .with(user(UserPrincipal.create(student))))
                .andExpect(status().isNotFound());
    }
}
