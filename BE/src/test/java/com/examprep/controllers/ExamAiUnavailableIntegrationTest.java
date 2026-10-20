package com.examprep.controllers;

import com.examprep.entities.Category;
import com.examprep.entities.Course;
import com.examprep.entities.User;
import com.examprep.security.UserPrincipal;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

import static org.hamcrest.Matchers.containsString;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = "app.exam-ai.api-key=")
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class ExamAiUnavailableIntegrationTest {
    @Autowired MockMvc mvc;
    @Autowired EntityManager em;

    @Test void missingProviderKeyReturnsUsefulErrorWithoutNetworkCall() throws Exception {
        User manager = User.builder().email(UUID.randomUUID() + "@example.com").fullName("Manager")
                .passwordHash("test-hash").roleName(User.ROLE_COURSE_MANAGER).build();
        em.persist(manager);
        Category category = Category.builder().name("AI test").slug(UUID.randomUUID().toString()).build();
        em.persist(category);
        Course course = Course.builder().categoryId(category.getCategoryId()).category(category).manager(manager)
                .title("Algebra").slug(UUID.randomUUID().toString()).isPublished(false).build();
        em.persist(course);
        em.flush();
        mvc.perform(post("/api/v1/manager/exams/ai/generate").with(user(UserPrincipal.create(manager)))
                .contentType(MediaType.APPLICATION_JSON).content("{\"courseId\":" + course.getCourseId()
                        + ",\"questionCount\":1,\"difficultyDistribution\":{\"EASY\":1},"
                        + "\"questionTypes\":[{\"questionType\":\"ESSAY\",\"count\":1}]}"))
                .andExpect(status().isBadGateway()).andExpect(jsonPath("$.message", containsString("OPENAI_API_KEY")));
    }
}
