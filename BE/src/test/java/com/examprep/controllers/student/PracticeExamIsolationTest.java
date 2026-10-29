package com.examprep.controllers.student;

import com.examprep.entities.*;
import com.examprep.entities.Module;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import static com.examprep.controllers.student.Fixtures.as;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** A student's own practice/smart exam must not leak into course lists or be startable by others. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class PracticeExamIsolationTest {
    @Autowired MockMvc mvc;
    @Autowired EntityManager em;
    Fixtures f;
    User owner, other, manager;
    Course course;
    Exam regular, practice;

    @BeforeEach void setUp() {
        f = new Fixtures(em);
        manager = f.account(User.ROLE_COURSE_MANAGER);
        owner = f.account(User.ROLE_STUDENT);
        other = f.account(User.ROLE_STUDENT);
        course = f.course(manager);
        Module module = f.module(course, "OOP");
        f.enroll(owner, course);
        f.enroll(other, course);
        regular = f.exam(course, module, manager, "EXAM");
        practice = f.exam(course, module, owner, "PRACTICE");
        Question q = f.question(course, module, "EASY");
        em.persist(ExamQuestion.builder().exam(practice).question(q).orderIndex(1).build());
        em.flush();
    }

    @Test void practiceExamIsNotListedForOtherStudentsOrManagers() throws Exception {
        mvc.perform(get("/api/v1/student/courses/" + course.getCourseId() + "/exams").with(as(other)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content[*].examId", hasItem(regular.getExamId().intValue())))
                .andExpect(jsonPath("$.data.content[*].examId", not(hasItem(practice.getExamId().intValue()))))
                .andExpect(jsonPath("$.data.totalElements").value(1));
        mvc.perform(get("/api/v1/manager/exams").param("courseId", course.getCourseId().toString()).with(as(manager)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content[*].examId", not(hasItem(practice.getExamId().intValue()))));
        mvc.perform(post("/api/v1/student/exams/" + practice.getExamId() + "/attempts").with(as(other)))
                .andExpect(status().isForbidden());
        mvc.perform(post("/api/v1/student/exams/" + practice.getExamId() + "/attempts").with(as(owner)))
                .andExpect(status().isCreated());
    }
}
