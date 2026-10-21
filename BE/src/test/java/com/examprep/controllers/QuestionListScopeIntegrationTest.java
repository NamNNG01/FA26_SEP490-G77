package com.examprep.controllers;

import com.examprep.entities.*;
import com.examprep.security.UserPrincipal;
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

import java.util.UUID;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Q-01 `courseIds`: list several courses at once, each one the caller manages. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class QuestionListScopeIntegrationTest {
    @Autowired MockMvc mvc;
    @Autowired EntityManager em;
    User manager, admin;
    Course first, second, foreign;

    @BeforeEach void fixtures() {
        manager = account("COURSE_MANAGER");
        User other = account("COURSE_MANAGER");
        admin = account("ADMIN");
        Category category = Category.builder().name("Scope category").slug(UUID.randomUUID().toString()).build();
        em.persist(category);
        first = course(manager, category);
        second = course(manager, category);
        foreign = course(other, category);
        question(first, "First course question");
        question(second, "Second course question");
        question(foreign, "Foreign course question");
    }

    @Test void courseIdsLimitsTheListToThoseCourses() throws Exception {
        call(manager, get("/api/v1/manager/questions")
                .param("courseIds", first.getCourseId().toString())
                .param("courseIds", second.getCourseId().toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalElements").value(2));
        call(manager, get("/api/v1/manager/questions").param("courseIds", first.getCourseId().toString()))
                .andExpect(jsonPath("$.data.totalElements").value(1));
    }

    @Test void courseIdsMustAllBeManagedByTheCaller() throws Exception {
        call(manager, get("/api/v1/manager/questions")
                .param("courseIds", first.getCourseId().toString())
                .param("courseIds", foreign.getCourseId().toString()))
                .andExpect(status().isForbidden());
        call(admin, get("/api/v1/manager/questions")
                .param("courseIds", first.getCourseId().toString())
                .param("courseIds", foreign.getCourseId().toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalElements").value(2));
    }

    private ResultActions call(User actor, MockHttpServletRequestBuilder request) throws Exception {
        em.flush();
        return mvc.perform(request.with(user(UserPrincipal.create(actor))));
    }

    private User account(String role) {
        User result = User.builder().email(UUID.randomUUID() + "@example.com").fullName(role).passwordHash("test").roleName(role).build();
        em.persist(result);
        return result;
    }

    private Course course(User owner, Category category) {
        Course result = Course.builder().manager(owner).category(category).categoryId(category.getCategoryId())
                .title("Course").slug(UUID.randomUUID().toString()).isPublished(false).build();
        em.persist(result);
        em.persist(CourseManager.builder().course(result).user(owner).build());
        return result;
    }

    private void question(Course parent, String content) {
        em.persist(Question.builder().course(parent).questionType("SINGLE_CHOICE").content(content).build());
    }
}
