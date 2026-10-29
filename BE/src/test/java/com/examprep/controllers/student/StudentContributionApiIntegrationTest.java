package com.examprep.controllers.student;

import com.examprep.entities.*;
import com.examprep.entities.Module;
import com.examprep.repositories.QuestionRepository;
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
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class StudentContributionApiIntegrationTest {
    @Autowired MockMvc mvc;
    @Autowired EntityManager em;
    @Autowired ObjectMapper json;
    @Autowired QuestionRepository questionRepository;
    Fixtures f;
    User student, other, manager;
    Course course, foreignCourse;
    Module oop, foreignModule;

    @BeforeEach void setUp() {
        f = new Fixtures(em);
        manager = f.account(User.ROLE_COURSE_MANAGER);
        student = f.account(User.ROLE_STUDENT);
        other = f.account(User.ROLE_STUDENT);
        course = f.course(manager);
        foreignCourse = f.course(manager);
        f.enroll(student, course);
        oop = f.module(course, "OOP");
        foreignModule = f.module(foreignCourse, "Foreign");
        em.flush();
    }

    @Test void testCQ01QuestionContributionComprehensive() throws Exception {
        long initialQuestionCount = questionRepository.count();

        // Valid request
        String validReq = "{\"courseId\":" + course.getCourseId() + ",\"moduleId\":" + oop.getModuleId() + ",\"questionType\":\"SINGLE_CHOICE\",\"difficulty\":\"MEDIUM\",\"content\":\"What is OOP?\",\"options\":[{\"optionText\":\"A\",\"isCorrect\":false},{\"optionText\":\"B\",\"isCorrect\":true}]}";
        JsonNode created = json.readTree(mvc.perform(post("/api/v1/student/contributions")
                .with(as(student))
                .contentType(MediaType.APPLICATION_JSON)
                .content(validReq))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.status").value("PENDING"))
                .andReturn().getResponse().getContentAsString()).path("data");

        // Verify NO official question was created in the official question bank
        assertEquals(initialQuestionCount, questionRepository.count());

        Long contribId = created.path("contributionId").asLong();
        QuestionContribution c = em.find(QuestionContribution.class, contribId);
        assertNotNull(c);
        assertEquals(student.getUserId(), c.getUserId());
        assertEquals("PENDING", c.getStatus());

        // Invalid: missing content -> 400
        String invalidReq = "{\"courseId\":" + course.getCourseId() + ",\"questionType\":\"SINGLE_CHOICE\",\"difficulty\":\"MEDIUM\",\"content\":\"\"}";
        mvc.perform(post("/api/v1/student/contributions")
                .with(as(student))
                .contentType(MediaType.APPLICATION_JSON)
                .content(invalidReq))
                .andExpect(status().isBadRequest());

        // Invalid: not enrolled -> 403
        String foreignReq = "{\"courseId\":" + foreignCourse.getCourseId() + ",\"questionType\":\"SINGLE_CHOICE\",\"difficulty\":\"MEDIUM\",\"content\":\"Test\",\"options\":[{\"optionText\":\"A\",\"isCorrect\":false},{\"optionText\":\"B\",\"isCorrect\":true}]}";
        mvc.perform(post("/api/v1/student/contributions")
                .with(as(student))
                .contentType(MediaType.APPLICATION_JSON)
                .content(foreignReq))
                .andExpect(status().isForbidden());

        // Invalid: module does not belong to course -> 404
        String badModuleReq = "{\"courseId\":" + course.getCourseId() + ",\"moduleId\":" + foreignModule.getModuleId() + ",\"questionType\":\"SINGLE_CHOICE\",\"difficulty\":\"MEDIUM\",\"content\":\"Test\",\"options\":[{\"optionText\":\"A\",\"isCorrect\":false},{\"optionText\":\"B\",\"isCorrect\":true}]}";
        mvc.perform(post("/api/v1/student/contributions")
                .with(as(student))
                .contentType(MediaType.APPLICATION_JSON)
                .content(badModuleReq))
                .andExpect(status().isNotFound());
    }

    @Test void testCQ03AndCQ04ListAndDetail() throws Exception {
        // Create tip contribution CQ-06
        String tipReq = "{\"courseId\":" + course.getCourseId() + ",\"title\":\"Tip 1\",\"content\":\"Always practice coding.\"}";
        JsonNode data = json.readTree(mvc.perform(post("/api/v1/student/tips/contributions")
                .with(as(student))
                .contentType(MediaType.APPLICATION_JSON)
                .content(tipReq))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString()).path("data");

        Long contribId = data.path("contributionId").asLong();

        // CQ-03: List contributions with filter & pagination
        mvc.perform(get("/api/v1/student/contributions")
                .param("type", "tip")
                .param("status", "PENDING")
                .param("page", "0")
                .param("size", "10")
                .with(as(student)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalElements").value(1))
                .andExpect(jsonPath("$.data.content[0].contributionId").value(contribId));

        // CQ-04: Detail (owner success 200, other student forbidden 403, non-existent 404)
        mvc.perform(get("/api/v1/student/contributions/" + contribId)
                .with(as(student)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.title").value("Tip 1"))
                .andExpect(jsonPath("$.data.status").value("PENDING"));

        mvc.perform(get("/api/v1/student/contributions/" + contribId)
                .with(as(other)))
                .andExpect(status().isForbidden());

        mvc.perform(get("/api/v1/student/contributions/999999")
                .with(as(student)))
                .andExpect(status().isNotFound());
    }

    @Test void testCQ05ResubmitComprehensive() throws Exception {
        // Create tip
        String tipReq = "{\"courseId\":" + course.getCourseId() + ",\"title\":\"Tip 1\",\"content\":\"Content 1\"}";
        JsonNode data = json.readTree(mvc.perform(post("/api/v1/student/tips/contributions")
                .with(as(student))
                .contentType(MediaType.APPLICATION_JSON)
                .content(tipReq))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString()).path("data");

        Long contribId = data.path("contributionId").asLong();

        // Resubmit when status is PENDING -> should conflict 409 NOT_REJECTED
        mvc.perform(put("/api/v1/student/contributions/" + contribId + "/resubmit")
                .with(as(student))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"courseId\":" + course.getCourseId() + ",\"title\":\"Updated Tip\",\"content\":\"Updated Content\"}"))
                .andExpect(status().isConflict());

        // Update status to REJECTED in db
        QuestionContribution c = em.find(QuestionContribution.class, contribId);
        c.setStatus("REJECTED");
        em.flush();

        // Other student resubmit -> 403 Forbidden
        mvc.perform(put("/api/v1/student/contributions/" + contribId + "/resubmit")
                .with(as(other))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"courseId\":" + course.getCourseId() + ",\"title\":\"Updated Tip\",\"content\":\"Updated Content\"}"))
                .andExpect(status().isForbidden());

        // Owner resubmit when REJECTED -> success 200, status PENDING, resubmissionCount incremented
        mvc.perform(put("/api/v1/student/contributions/" + contribId + "/resubmit")
                .with(as(student))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"courseId\":" + course.getCourseId() + ",\"title\":\"Updated Tip\",\"content\":\"Updated Content\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("PENDING"))
                .andExpect(jsonPath("$.data.resubmissionCount").value(1));

        // Verify tip does not appear in DI-07 tips list (which only shows approved tips)
        mvc.perform(get("/api/v1/student/tips")
                .param("courseId", course.getCourseId().toString())
                .with(as(student)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalElements").value(0));
    }
}
