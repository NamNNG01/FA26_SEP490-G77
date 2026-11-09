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
                .andExpect(jsonPath("$.data.enrollment.isEnrolled").value(false));
    }

    @Test
    void listMyCourses_EnrolledStudent() throws Exception {
        mvc.perform(get("/api/v1/student/my-courses").with(user(UserPrincipal.create(student))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.content[0].courseId").value(publishedCourse.getCourseId()))
                .andExpect(jsonPath("$.data.content[0].progress").value(0));
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
    void batchedProgressMatchesDetailForGeneralModulesAndCompletedContent() {
        Module visible = em.createQuery("from Module m where m.course = :course", Module.class)
                .setParameter("course", publishedCourse).getSingleResult();
        Module hidden = Module.builder().course(publishedCourse).title("Hidden").status("HIDDEN").orderIndex(2).build();
        em.persist(hidden);
        for (Module scope : new Module[]{null, visible, hidden}) {
            for (int i = 0; i < 2; i++) {
                Question question = Question.builder().course(publishedCourse).module(scope)
                        .questionType("SINGLE_CHOICE").content("Practice " + i).status("ACTIVE").build();
                em.persist(question);
                if (i == 0) em.persist(QuestionPracticeProgress.builder().course(publishedCourse).module(scope)
                        .user(student).question(question).totalAttempts(1).gradedAttempts(1).correctAttempts(1).build());
            }
        }
        Exam exam = em.createQuery("from Exam e where e.course = :course", Exam.class)
                .setParameter("course", publishedCourse).getSingleResult();
        // Multiple submissions still count as one completed exam.
        for (int i = 0; i < 2; i++) em.persist(ExamAttempt.builder().exam(exam).user(student)
                .status("COMPLETED").startTime(Instant.now()).deadlineAt(Instant.now().plusSeconds(60))
                .submitTime(Instant.now()).totalScore(BigDecimal.TEN).build());
        Flashcard card = em.createQuery("from Flashcard f where f.deck.course = :course", Flashcard.class)
                .setParameter("course", publishedCourse).getSingleResult();
        em.persist(UserCardProgress.builder().user(student).card(card).isStarred(false).status("KNOWN").build());
        em.flush();
        em.clear();
        int batch = progressService.liveProgressPercents(student.getUserId(), List.of(publishedCourse.getCourseId()))
                .get(publishedCourse.getCourseId());
        assertEquals(67, batch); // General: (50 + 100 + 100)/3 = 83; module: 50; course: 67.
        assertEquals(progressService.liveProgressPercent(student.getUserId(), publishedCourse.getCourseId()), batch);
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
