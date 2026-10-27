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
                .andExpect(jsonPath("$.data.content[0].progress").value(25));
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
}
