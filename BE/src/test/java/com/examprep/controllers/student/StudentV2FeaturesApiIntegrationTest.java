package com.examprep.controllers.student;

import com.examprep.dto.student.DiscussionItemDto;
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
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
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
    User student, other, manager, admin;
    Course course, foreignCourse;
    Module oop;
    Question q;

    @BeforeEach void setUp() {
        f = new Fixtures(em);
        manager = f.account(User.ROLE_COURSE_MANAGER);
        admin = f.account(User.ROLE_ADMIN);
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
                .andExpect(status().isNotFound());

        em.persist(QuestionPracticeProgress.builder()
                .user(student)
                .course(course)
                .module(oop)
                .question(q)
                .totalAttempts(1)
                .gradedAttempts(1)
                .correctAttempts(1)
                .updatedAt(java.time.Instant.now())
                .build());
        em.flush();

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

        Long attemptId = json.readTree(mvc.perform(post("/api/v1/student/questions/review-session")
                .with(as(student))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"courseId\":" + course.getCourseId() + ",\"type\":\"bookmarked\",\"size\":1,\"durationMinutes\":15}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.attemptId").exists())
                .andReturn().getResponse().getContentAsString()).path("data").path("attemptId").asLong();

        mvc.perform(get("/api/v1/student/attempts/" + attemptId)
                .with(as(student)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.examMode").value("PRACTICE_EXAM"));

        mvc.perform(post("/api/v1/student/attempts/" + attemptId + "/submit")
                .with(as(student)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("COMPLETED"));

        mvc.perform(get("/api/v1/student/attempts/" + attemptId + "/result")
                .with(as(student)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.examMode").value("PRACTICE_EXAM"));

        mvc.perform(post("/api/v1/student/attempts/" + attemptId + "/review-acknowledged")
                .with(as(student)))
                .andExpect(status().isOk());

        mvc.perform(post("/api/v1/student/questions/review-session")
                .with(as(student))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"type\":\"bookmarked\",\"size\":100,\"durationMinutes\":15}"))
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

        // A student who is not enrolled in the course cannot post to it, even by URL.
        mvc.perform(post("/api/v1/student/discussions")
                .with(as(other))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"courseId\":" + course.getCourseId() + ",\"title\":\"Java\",\"content\":\"Help\",\"tag\":\"question\"}"))
                .andExpect(status().isForbidden());

        JsonNode created = json.readTree(mvc.perform(post("/api/v1/student/discussions")
                .with(as(student))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"courseId\":" + course.getCourseId() + ",\"title\":\"How to learn Java?\",\"content\":\"Please share tips.\",\"tag\":\"question\",\"imageUrl\":\"https://cdn.test/java.png\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.approvalStatus").value("PENDING"))
                .andExpect(jsonPath("$.data.tag").value("question"))
                .andReturn().getResponse().getContentAsString()).path("data");

        Long discId = created.path("discussionId").asLong();

        // Moderation: a pending post is visible to its author only — it is not in the public list.
        mvc.perform(get("/api/v1/student/discussions")
                .param("courseId", course.getCourseId().toString())
                .param("tag", "question")
                .param("sort", "latest")
                .with(as(student)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalElements").value(0));

        mvc.perform(get("/api/v1/student/discussions/" + discId)
                .with(as(student)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.title").value("How to learn Java?"))
                .andExpect(jsonPath("$.data.isAuthor").value(true));

        // An admin approves it; only then does the post become public.
        mvc.perform(post("/api/v1/admin/discussions/" + discId + "/approve").with(as(admin)))
                .andExpect(status().isOk());

        mvc.perform(get("/api/v1/student/discussions")
                .param("courseId", course.getCourseId().toString())
                .param("tag", "question")
                .param("sort", "latest")
                .with(as(student)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalElements").value(1))
                .andExpect(jsonPath("$.data.content[0].tag").value("question"));

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

    @Test void anonymousPostsAndCommentsNeverExposeTheirAuthor() throws Exception {
        Long discId = utf8(mvc.perform(post("/api/v1/student/discussions")
                .with(as(student))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"courseId\":" + course.getCourseId()
                        + ",\"title\":\"Anonymous question\",\"content\":\"Body\",\"tag\":\"question\",\"isAnonymous\":true}"))
                .andExpect(status().isCreated())).path("data").path("discussionId").asLong();

        // The author can still act on their own post, but the payload carries no identity.
        JsonNode own = utf8(mvc.perform(get("/api/v1/student/discussions/" + discId).with(as(student)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.isAuthor").value(true))).path("data");
        assertTrue(own.path("author").path("userId").isMissingNode()
                        || own.path("author").path("userId").isNull(),
                "an anonymous author's user id must never be returned");
        assertEquals(DiscussionItemDto.AuthorDto.ANONYMOUS_DISPLAY_NAME, own.path("author").path("displayName").asText());

        // Approval comes before the reply: an unapproved post refuses comments.
        mvc.perform(post("/api/v1/admin/discussions/" + discId + "/approve").with(as(admin)))
                .andExpect(status().isOk());

        JsonNode comment = utf8(mvc.perform(post("/api/v1/student/discussions/" + discId + "/comments")
                .with(as(student))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"content\":\"An anonymous reply\",\"isAnonymous\":true}"))
                .andExpect(status().isCreated())).path("data");
        assertEquals(DiscussionItemDto.AuthorDto.ANONYMOUS_DISPLAY_NAME, comment.path("author").path("displayName").asText());
        assertTrue(comment.path("author").path("userId").isMissingNode()
                || comment.path("author").path("userId").isNull());

        // A second student reads the approved post from the public list: still no identity.
        JsonNode listed = utf8(mvc.perform(get("/api/v1/student/discussions")
                .param("courseId", course.getCourseId().toString())
                .with(as(other)))
                .andExpect(status().isOk())).path("data").path("content").get(0);
        assertTrue(listed.path("author").path("userId").isMissingNode()
                        || listed.path("author").path("userId").isNull(),
                "the public list must not unmask an anonymous author");
        assertTrue(listed.path("author").path("role").isMissingNode()
                || listed.path("author").path("role").isNull());
        assertEquals(DiscussionItemDto.AuthorDto.ANONYMOUS_DISPLAY_NAME, listed.path("author").path("displayName").asText());

        JsonNode detail = utf8(mvc.perform(get("/api/v1/student/discussions/" + discId).with(as(other)))
                .andExpect(status().isOk())).path("data");
        assertTrue(detail.path("author").path("userId").isMissingNode()
                || detail.path("author").path("userId").isNull());
        assertTrue(detail.path("comments").get(0).path("author").path("userId").isMissingNode()
                        || detail.path("comments").get(0).path("author").path("userId").isNull(),
                "an anonymous comment must not expose its author either");
    }

    /**
     * Parses a response body as UTF-8. MockHttpServletResponse#getContentAsString falls back to
     * ISO-8859-1 for an application/json response without an explicit charset, which turns the
     * masked display name (Học sinh ẩn danh) into mojibake before it can be compared.
     */
    private JsonNode utf8(org.springframework.test.web.servlet.ResultActions actions) throws Exception {
        return json.readTree(actions.andReturn().getResponse()
                .getContentAsString(java.nio.charset.StandardCharsets.UTF_8));
    }
}