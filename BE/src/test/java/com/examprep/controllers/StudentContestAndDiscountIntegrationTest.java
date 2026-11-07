package com.examprep.controllers;

import com.examprep.controllers.student.Fixtures;
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

import java.math.BigDecimal;
import java.time.Instant;
import java.time.temporal.ChronoUnit;

import static com.examprep.controllers.student.Fixtures.as;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class StudentContestAndDiscountIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired EntityManager em;
    Fixtures f;
    User student;
    Contest contest;
    Discount discount;
    UserDiscount userDiscount;

    @BeforeEach void setUp() {
        f = new Fixtures(em);
        student = f.account(User.ROLE_STUDENT);
        User manager = f.account(User.ROLE_COURSE_MANAGER);
        Course course = f.course(manager);
        Module module = f.module(course, "Mod");

        discount = Discount.builder()
                .code("CONTEST-TEST-CODE")
                .name("Test Discount")
                .discountType("PERCENT")
                .value(new BigDecimal("20"))
                .usageLimit(10)
                .isActive(true)
                .expiresAt(Instant.now().plus(10, ChronoUnit.DAYS))
                .build();
        em.persist(discount);

        userDiscount = UserDiscount.builder()
                .user(student)
                .discount(discount)
                .isUsed(false)
                .sourceType("CONTEST")
                .sourceId(1L)
                .build();
        em.persist(userDiscount);

        contest = Contest.builder()
                .exam(f.exam(course, module, manager, "Exam"))
                .course(course)
                .createdBy(manager)
                .title("Test Contest")
                .durationMinutes(30)
                .startTime(Instant.now().plus(1, ChronoUnit.HOURS))
                .endTime(Instant.now().plus(2, ChronoUnit.HOURS))
                .status("PUBLISHED")
                .build();
        em.persist(contest);
        em.flush();
    }

    @Test
    void testGetContestDetail() throws Exception {
        mvc.perform(get("/api/v1/student/contests/" + contest.getContestId())
                        .with(as(student)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.contestId").value(contest.getContestId()))
                .andExpect(jsonPath("$.data.title").value("Test Contest"))
                .andExpect(jsonPath("$.data.isRegistered").value(false));
    }

    @Test
    void testListStudentDiscounts() throws Exception {
        mvc.perform(get("/api/v1/student/discounts")
                        .with(as(student)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.content").isArray())
                .andExpect(jsonPath("$.data.content[0].code").value("CONTEST-TEST-CODE"))
                .andExpect(jsonPath("$.data.content[0].status").value("AVAILABLE"));
    }

    @Test
    void testGetStudentDiscountDetail() throws Exception {
        mvc.perform(get("/api/v1/student/discounts/" + userDiscount.getUserDiscountId())
                        .with(as(student)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.code").value("CONTEST-TEST-CODE"))
                .andExpect(jsonPath("$.data.status").value("AVAILABLE"));
    }
}
