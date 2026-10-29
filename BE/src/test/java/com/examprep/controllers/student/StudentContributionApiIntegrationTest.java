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
import org.springframework.mock.web.MockMultipartFile;
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
    Fixtures f;
    User student, other, manager;
    Course course;
    Module oop;

    @BeforeEach void setUp() {
        f = new Fixtures(em);
        manager = f.account(User.ROLE_COURSE_MANAGER);
        student = f.account(User.ROLE_STUDENT);
        other = f.account(User.ROLE_STUDENT);
        course = f.course(manager);
        f.enroll(student, course);
        oop = f.module(course, "OOP");
        em.flush();
    }

    @Test void testQuestionContributionCQ01() throws Exception {
        String reqBody = "{\"courseId\":" + course.getCourseId() + ",\"moduleId\":" + oop.getModuleId() + ",\"questionType\":\"SINGLE_CHOICE\",\"difficulty\":\"MEDIUM\",\"content\":\"What is OOP?\",\"options\":[{\"optionText\":\"A\",\"isCorrect\":false},{\"optionText\":\"B\",\"isCorrect\":true}]}";
        mvc.perform(post("/api/v1/student/contributions")
                .with(as(student))
                .contentType(MediaType.APPLICATION_JSON)
                .content(reqBody))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.status").value("PENDING"));
    }

    @Test void testDocumentContributionCQ02() throws Exception {
        MockMultipartFile file = new MockMultipartFile("file", "study.pdf", "application/pdf", new byte[]{1, 2, 3, 4});
        mvc.perform(multipart("/api/v1/student/contributions/documents")
                .file(file)
                .param("courseId", course.getCourseId().toString())
                .param("title", "Study Material PDF")
                .with(as(student)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.status").value("PENDING"))
                .andExpect(jsonPath("$.data.fileName").value("study.pdf"));
    }

    @Test void testListAndDetailCQ03CQ04() throws Exception {
        String tipReq = "{\"courseId\":" + course.getCourseId() + ",\"title\":\"Tip 1\",\"content\":\"Always practice coding.\"}";
        JsonNode data = json.readTree(mvc.perform(post("/api/v1/student/tips/contributions")
                .with(as(student))
                .contentType(MediaType.APPLICATION_JSON)
                .content(tipReq))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString()).path("data");

        Long contribId = data.path("contributionId").asLong();

        mvc.perform(get("/api/v1/student/contributions")
                .param("type", "tip")
                .param("status", "PENDING")
                .with(as(student)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalElements").value(1))
                .andExpect(jsonPath("$.data.content[0].contributionId").value(contribId));

        mvc.perform(get("/api/v1/student/contributions/" + contribId)
                .with(as(student)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.title").value("Tip 1"))
                .andExpect(jsonPath("$.data.status").value("PENDING"));

        mvc.perform(get("/api/v1/student/contributions/" + contribId)
                .with(as(other)))
                .andExpect(status().isForbidden());
    }

    @Test void testResubmitCQ05() throws Exception {
        String tipReq = "{\"courseId\":" + course.getCourseId() + ",\"title\":\"Tip 1\",\"content\":\"Content 1\"}";
        JsonNode data = json.readTree(mvc.perform(post("/api/v1/student/tips/contributions")
                .with(as(student))
                .contentType(MediaType.APPLICATION_JSON)
                .content(tipReq))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString()).path("data");

        Long contribId = data.path("contributionId").asLong();

        mvc.perform(put("/api/v1/student/contributions/" + contribId + "/resubmit")
                .with(as(student))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"courseId\":" + course.getCourseId() + ",\"title\":\"Updated Tip\",\"content\":\"Updated Content\"}"))
                .andExpect(status().isConflict());

        QuestionContribution c = em.find(QuestionContribution.class, contribId);
        c.setStatus("REJECTED");
        em.flush();

        mvc.perform(put("/api/v1/student/contributions/" + contribId + "/resubmit")
                .with(as(student))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"courseId\":" + course.getCourseId() + ",\"title\":\"Updated Tip\",\"content\":\"Updated Content\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("PENDING"))
                .andExpect(jsonPath("$.data.resubmissionCount").value(1));
    }
}
