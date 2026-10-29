package com.examprep.controllers.student;

import com.examprep.entities.*;
import com.examprep.entities.Module;
import com.fasterxml.jackson.databind.JsonNode;
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

import static com.examprep.controllers.student.Fixtures.as;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class StudentV2FeaturesApiIntegrationTest {
    @Autowired MockMvc mvc;
    @Autowired EntityManager em;
    @Autowired ObjectMapper json;
    Fixtures f;
    User student, other, manager;
    Course course, foreignCourse;
    Module oop;
    Question q;

    @BeforeEach void setUp() {
        f = new Fixtures(em);
        manager = f.account(User.ROLE_COURSE_MANAGER);
        student = f.account(User.ROLE_STUDENT);
        other = f.account(User.ROLE_STUDENT);
        course = f.course(manager);
        foreignCourse = f.course(manager);
        f.enroll(student, course);
        oop = f.module(course, "OOP");
        q = f.question(course, oop, "MEDIUM");
        em.flush();
    }

    @Test void testProgressLp01Lp02NegativeAndEdgeCases() throws Exception {
        mvc.perform(get("/api/v1/student/progress/courses/" + course.getCourseId())
                .with(as(student)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.courseId").value(course.getCourseId()));

        mvc.perform(get("/api/v1/student/progress/courses/" + foreignCourse.getCourseId())
                .with(as(student)))
                .andExpect(status().isForbidden());

        mvc.perform(get("/api/v1/student/progress/courses/999999")
                .with(as(student)))
                .andExpect(status().isNotFound());

        mvc.perform(get("/api/v1/student/progress/activities")
                .param("type", "EXAM")
                .param("page", "0")
                .param("size", "10")
                .with(as(student)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content").isArray());
    }

    @Test void testMistakeNotebookMn01ToMn05Comprehensive() throws Exception {
        mvc.perform(post("/api/v1/student/questions/" + q.getQuestionId() + "/bookmark")
                .with(as(student)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.isBookmarked").value(true));

        mvc.perform(post("/api/v1/student/questions/" + q.getQuestionId() + "/bookmark")
                .with(as(student)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.isBookmarked").value(false));

        mvc.perform(post("/api/v1/student/questions/" + q.getQuestionId() + "/bookmark")
                .with(as(student)))
                .andExpect(status().isOk());

        JsonNode savedList = json.readTree(mvc.perform(get("/api/v1/student/questions/saved")
                .param("type", "bookmarked")
                .with(as(student)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalElements").value(1))
                .andReturn().getResponse().getContentAsString()).path("data").path("content");

        Long reviewId = savedList.get(0).path("reviewId").asLong();

        mvc.perform(get("/api/v1/student/questions/weak-spots")
                .param("limit", "5")
                .with(as(student)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data").isArray());

        mvc.perform(post("/api/v1/student/questions/review-session")
                .with(as(student))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"type\":\"bookmarked\",\"size\":5}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.attemptId").exists());

        mvc.perform(post("/api/v1/student/questions/review-session")
                .with(as(student))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"type\":\"bookmarked\",\"size\":100}"))
                .andExpect(status().isBadRequest());

        // Other student delete returns 404 (not found / not owner security pattern)
        mvc.perform(delete("/api/v1/student/questions/saved/" + reviewId)
                .with(as(other)))
                .andExpect(status().isNotFound());

        mvc.perform(delete("/api/v1/student/questions/saved/" + reviewId)
                .with(as(student)))
                .andExpect(status().isOk());
    }

    @Test void testDiscussionsAndTipsDi01ToDi08Comprehensive() throws Exception {
        mvc.perform(post("/api/v1/student/discussions")
                .with(as(student))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"courseId\":" + course.getCourseId() + ",\"title\":\"\",\"content\":\"\",\"tag\":\"question\"}"))
                .andExpect(status().isBadRequest());

        mvc.perform(post("/api/v1/student/discussions")
                .with(as(other))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"courseId\":" + course.getCourseId() + ",\"title\":\"Java\",\"content\":\"Help\",\"tag\":\"question\"}"))
                .andExpect(status().isForbidden());

        JsonNode created = json.readTree(mvc.perform(post("/api/v1/student/discussions")
                .with(as(student))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"courseId\":" + course.getCourseId() + ",\"title\":\"How to learn Java?\",\"content\":\"Please share tips.\",\"tag\":\"question\"}"))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString()).path("data");

        Long discId = created.path("discussionId").asLong();

        mvc.perform(get("/api/v1/student/discussions")
                .param("courseId", course.getCourseId().toString())
                .param("sort", "latest")
                .with(as(student)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalElements").value(1));

        mvc.perform(get("/api/v1/student/discussions/" + discId)
                .with(as(student)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.title").value("How to learn Java?"));

        mvc.perform(post("/api/v1/student/discussions/" + discId + "/comments")
                .with(as(student))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"content\":\"Practice coding daily.\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.content").value("Practice coding daily."));

        mvc.perform(post("/api/v1/student/discussions/" + discId + "/upvote")
                .with(as(student)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.isUpvoted").value(true));

        mvc.perform(post("/api/v1/student/discussions/" + discId + "/bookmark")
                .with(as(student)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.isBookmarked").value(true));

        mvc.perform(get("/api/v1/student/tips")
                .param("courseId", course.getCourseId().toString())
                .with(as(student)))
                .andExpect(status().isOk());

        mvc.perform(patch("/api/v1/student/discussions/" + discId)
                .with(as(other))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"isClosed\":true}"))
                .andExpect(status().isForbidden());

        mvc.perform(patch("/api/v1/student/discussions/" + discId)
                .with(as(student))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"isClosed\":true}"))
                .andExpect(status().isOk());
    }
}
