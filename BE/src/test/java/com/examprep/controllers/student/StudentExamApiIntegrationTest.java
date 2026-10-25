package com.examprep.controllers.student;

import com.examprep.entities.*;
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
class StudentExamApiIntegrationTest {

    @Autowired
    private MockMvc mvc;

    @Autowired
    private ObjectMapper json;

    @Autowired
    private EntityManager em;

    private User student;
    private User manager;
    private Course publishedCourse;
    private Exam publishedExam;
    private ExamAttempt attempt;

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

        publishedExam = Exam.builder()
                .course(publishedCourse)
                .createdBy(manager)
                .title("Midterm Java")
                .durationMinutes(60)
                .isPractice(false)
                .generationType("FIXED")
                .maxScore(BigDecimal.TEN)
                .status("PUBLISHED")
                .publishedAt(Instant.now())
                .build();
        em.persist(publishedExam);

        Question q = Question.builder()
                .course(publishedCourse)
                .createdBy(manager)
                .questionType("SINGLE_CHOICE")
                .content("What is Spring Boot?")
                .status("ACTIVE")
                .approvalStatus("APPROVED")
                .build();
        em.persist(q);

        ExamQuestion eq = ExamQuestion.builder()
                .exam(publishedExam)
                .question(q)
                .orderIndex(1)
                .weight(BigDecimal.ONE)
                .build();
        em.persist(eq);

        Enrollment enrollment = Enrollment.builder()
                .course(publishedCourse)
                .user(student)
                .enrolledAt(Instant.now())
                .status("ACTIVE")
                .progress(50)
                .build();
        em.persist(enrollment);

        attempt = ExamAttempt.builder()
                .exam(publishedExam)
                .user(student)
                .startTime(Instant.now())
                .deadlineAt(Instant.now().plusSeconds(3600))
                .status("COMPLETED")
                .totalScore(BigDecimal.valueOf(9))
                .submitTime(Instant.now())
                .build();
        em.persist(attempt);
        em.flush();
    }

    @Test
    void getExamDetail_Success() throws Exception {
        mvc.perform(get("/api/v1/student/exams/" + publishedExam.getExamId()).with(user(UserPrincipal.create(student))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.examId").value(publishedExam.getExamId()))
                .andExpect(jsonPath("$.data.title").value("Midterm Java"))
                .andExpect(jsonPath("$.data.questionsSummary.totalCount").value(1));
    }

    @Test
    void listMyExams_Success() throws Exception {
        mvc.perform(get("/api/v1/student/my-exams").with(user(UserPrincipal.create(student))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.content[0].attemptId").value(attempt.getAttemptId()))
                .andExpect(jsonPath("$.data.content[0].totalScore").value(9));
    }
}
