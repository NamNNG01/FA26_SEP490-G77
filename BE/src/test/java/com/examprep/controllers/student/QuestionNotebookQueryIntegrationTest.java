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
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.HashSet;
import java.util.Set;

import static com.examprep.controllers.student.Fixtures.as;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** MN-01 / MN-05 queries: no dead rows, course filter, live questions only. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class QuestionNotebookQueryIntegrationTest {
    @Autowired MockMvc mvc;
    @Autowired EntityManager em;
    @Autowired ObjectMapper json;
    Fixtures f;
    User student;
    Course course, otherCourse;
    Question wrong, bookmarked, resolved, deleted, foreign;

    @BeforeEach void setUp() {
        f = new Fixtures(em);
        User manager = f.account(User.ROLE_COURSE_MANAGER);
        student = f.account(User.ROLE_STUDENT);
        course = f.course(manager);
        otherCourse = f.course(manager);
        Module module = f.module(course, "M1"), otherModule = f.module(otherCourse, "M2");
        wrong = f.question(course, module, "EASY");
        bookmarked = f.question(course, module, "EASY");
        resolved = f.question(course, module, "EASY");
        deleted = f.question(course, module, "EASY");
        deleted.setDeletedAt(Instant.now());
        foreign = f.question(otherCourse, otherModule, "EASY");
        row(wrong, "WRONG_BOOKMARKED", false, 3);
        row(bookmarked, "ANSWERED_BOOKMARKED", true, 0);
        row(resolved, "ANSWERED_BOOKMARKED", false, 2); // fixed twice in a row and not bookmarked: no longer in the notebook
        row(deleted, "WRONG_BOOKMARKED", false, 5);
        row(foreign, "WRONG_BOOKMARKED", false, 9);
        em.flush();
    }

    private void row(Question q, String status, boolean bookmark, int wrongCount) {
        em.persist(StudentQuestionReview.builder().student(student).question(q).status(status).bookmark(bookmark).wrongCount(wrongCount)
                .firstWrongAt(Instant.now().minus(3, ChronoUnit.DAYS)).lastPracticedAt(Instant.now().minus(1, ChronoUnit.DAYS)).build());
    }

    @Test void allListsOnlyWrongOrBookmarkedRows() throws Exception {
        Set<Long> ids = ids(data("/api/v1/student/questions/saved?type=all&courseId=" + course.getCourseId()).path("content"));
        assertEquals(Set.of(wrong.getQuestionId(), bookmarked.getQuestionId(), deleted.getQuestionId()), ids);
    }

    @Test void weakSpotsAreLiveStillWrongAndCourseScoped() throws Exception {
        assertEquals(Set.of(wrong.getQuestionId()), ids(data("/api/v1/student/questions/weak-spots?courseId=" + course.getCourseId())));
        JsonNode all = data("/api/v1/student/questions/weak-spots");
        assertEquals(foreign.getQuestionId(), all.get(0).path("questionId").asLong()); // most wrong first, across courses
        assertEquals(2, all.size());
    }

    private Set<Long> ids(JsonNode items) {
        Set<Long> ids = new HashSet<>();
        items.forEach(i -> ids.add(i.path("questionId").asLong()));
        return ids;
    }

    private JsonNode data(String url) throws Exception {
        String body = mvc.perform(get(url).with(as(student))).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return json.readTree(body).path("data");
    }
}
