package com.examprep.controllers;

import com.examprep.entities.*;
import com.examprep.repositories.QuestionContributionRepository;
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
import java.util.UUID;

import static com.examprep.controllers.student.Fixtures.as;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class ManagerContributionApiIntegrationTest {
    @Autowired MockMvc mvc;
    @Autowired EntityManager em;
    @Autowired ObjectMapper json;
    @Autowired QuestionContributionRepository contributionRepository;

    User manager, student;
    Course course;
    QuestionContribution c1, c2;

    @BeforeEach
    void setUp() {
        manager = User.builder()
                .email(UUID.randomUUID() + "@manager.com")
                .fullName("Manager One")
                .passwordHash("test")
                .roleName("COURSE_MANAGER")
                .status(User.STATUS_ACTIVE)
                .build();
        em.persist(manager);

        student = User.builder()
                .email(UUID.randomUUID() + "@student.com")
                .fullName("Student A")
                .passwordHash("test")
                .roleName("STUDENT")
                .status(User.STATUS_ACTIVE)
                .build();
        em.persist(student);

        Category category = Category.builder()
                .name("Test Cat")
                .slug(UUID.randomUUID().toString())
                .build();
        em.persist(category);

        course = Course.builder()
                .manager(manager)
                .category(category)
                .categoryId(category.getCategoryId())
                .title("Test Course")
                .slug(UUID.randomUUID().toString())
                .price(BigDecimal.ZERO)
                .isPublished(true)
                .build();
        em.persist(course);

        CourseManager cm = CourseManager.builder()
                .course(course)
                .user(manager)
                .build();
        em.persist(cm);

        c1 = QuestionContribution.builder()
                .userId(student.getUserId())
                .courseId(course.getCourseId())
                .type("QUESTION")
                .content("Question 1")
                .status("PENDING")
                .build();
        em.persist(c1);

        c2 = QuestionContribution.builder()
                .userId(student.getUserId())
                .courseId(course.getCourseId())
                .type("QUESTION")
                .content("Question 2")
                .status("PENDING")
                .build();
        em.persist(c2);
        em.flush();
    }

    @Test
    void testListContributionsSortedNewestFirstAndDetailReturnsCourseAndContributorId() throws Exception {
        // Test list sorts by submittedAt descending (newest first, so c2 then c1)
        mvc.perform(get("/api/v1/manager/contributions")
                .with(as(manager)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content[0].contributionId").value(c2.getContributionId()))
                .andExpect(jsonPath("$.data.content[1].contributionId").value(c1.getContributionId()));

        // Test detail returns courseId and contributorId
        mvc.perform(get("/api/v1/manager/contributions/" + c1.getContributionId())
                .with(as(manager)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.contributionId").value(c1.getContributionId()))
                .andExpect(jsonPath("$.data.courseId").value(course.getCourseId()))
                .andExpect(jsonPath("$.data.contributorId").value(student.getUserId()));
    }
}
