package com.examprep.controllers;

import com.examprep.dto.AdminDiscountDtos.*;
import com.examprep.entities.*;
import com.examprep.repositories.*;
import com.fasterxml.jackson.databind.ObjectMapper;
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
import java.time.Instant;

import static com.examprep.controllers.student.Fixtures.as;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class DiscountAccessTypeApiTest {

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper objectMapper;
    @Autowired DiscountRepository discountRepository;
    @Autowired UserDiscountRepository userDiscountRepository;
    @Autowired UserRepository userRepository;
    @Autowired CourseRepository courseRepository;
    @Autowired CategoryRepository categoryRepository;

    User admin, student;
    Discount publicDiscount, claimDiscount;
    Course course;

    @BeforeEach void setUp() {
        admin = User.builder().email("admin@test.com").fullName("Admin").passwordHash("hash").roleName(User.ROLE_ADMIN).build();
        userRepository.save(admin);

        student = User.builder().email("student@test.com").fullName("Student").passwordHash("hash").roleName(User.ROLE_STUDENT).build();
        userRepository.save(student);

        Category category = Category.builder().name("Programming").slug("programming").build();
        categoryRepository.save(category);

        course = Course.builder().manager(admin).category(category).categoryId(category.getCategoryId()).title("Java Course").slug("java-course").price(BigDecimal.valueOf(200000)).isPublished(true).build();
        courseRepository.save(course);

        publicDiscount = Discount.builder()
                .code("PUB50")
                .name("Public 50")
                .discountType("PERCENT")
                .percent(BigDecimal.valueOf(50))
                .accessType("PUBLIC")
                .usageLimit(100)
                .usedCount(0)
                .isActive(true)
                .appliesTo("COURSE")
                .build();
        discountRepository.save(publicDiscount);

        claimDiscount = Discount.builder()
                .code("CLAIM20")
                .name("Claim 20")
                .discountType("PERCENT")
                .percent(BigDecimal.valueOf(20))
                .accessType("CLAIM_REQUIRED")
                .usageLimit(100)
                .usedCount(0)
                .isActive(true)
                .appliesTo("COURSE")
                .build();
        discountRepository.save(claimDiscount);
    }

    @Test void testCreateDiscountWithAccessTypeDefaultPublic() throws Exception {
        DiscountWriteRequest req = new DiscountWriteRequest(
                "DEFAULTTYPE", "Default Type", "Desc", "PERCENT",
                BigDecimal.valueOf(10), null, null, "COURSE", null, 10, null, null, true
        );

        mvc.perform(post("/api/v1/admin/discounts")
                .with(as(admin))
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.accessType").value("PUBLIC"));
    }

    @Test void testCreateDiscountWithClaimRequired() throws Exception {
        DiscountWriteRequest req = new DiscountWriteRequest(
                "CLAIMNEW", "Claim New", "Desc", "PERCENT",
                BigDecimal.valueOf(15), null, null, "COURSE", "CLAIM_REQUIRED", 10, null, null, true
        );

        mvc.perform(post("/api/v1/admin/discounts")
                .with(as(admin))
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.accessType").value("CLAIM_REQUIRED"));
    }

    @Test void testCreateDiscountWithInvalidAccessTypeFails() throws Exception {
        DiscountWriteRequest req = new DiscountWriteRequest(
                "BADTYPE", "Bad Type", "Desc", "PERCENT",
                BigDecimal.valueOf(10), null, null, "COURSE", "INVALID_TYPE", 10, null, null, true
        );

        mvc.perform(post("/api/v1/admin/discounts")
                .with(as(admin))
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isBadRequest());
    }

    @Test void testValidatePublicDiscountSuccessWithoutAssignment() throws Exception {
        mvc.perform(get("/api/v1/student/discounts/validate")
                .param("code", "PUB50")
                .param("courseId", course.getCourseId().toString())
                .with(as(student)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.valid").value(true))
                .andExpect(jsonPath("$.data.discountAmount").value(100000));
    }

    @Test void testValidateClaimRequiredDiscountWithoutAssignmentFails() throws Exception {
        mvc.perform(get("/api/v1/student/discounts/validate")
                .param("code", "CLAIM20")
                .param("courseId", course.getCourseId().toString())
                .with(as(student)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.valid").value(false))
                .andExpect(jsonPath("$.data.reason").exists());
    }

    @Test void testValidateClaimRequiredDiscountWithAssignmentSucceeds() throws Exception {
        userDiscountRepository.save(UserDiscount.builder()
                .user(student)
                .discount(claimDiscount)
                .isUsed(false)
                .sourceType("CONTEST")
                .sourceId(1L)
                .build());

        mvc.perform(get("/api/v1/student/discounts/validate")
                .param("code", "CLAIM20")
                .param("courseId", course.getCourseId().toString())
                .with(as(student)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.valid").value(true))
                .andExpect(jsonPath("$.data.discountAmount").value(40000));
    }

    @Test void testValidateAlreadyUsedDiscountFails() throws Exception {
        userDiscountRepository.save(UserDiscount.builder()
                .user(student)
                .discount(publicDiscount)
                .isUsed(true)
                .sourceType("PAYMENT")
                .sourceId(1L)
                .build());

        mvc.perform(get("/api/v1/student/discounts/validate")
                .param("code", "PUB50")
                .param("courseId", course.getCourseId().toString())
                .with(as(student)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.valid").value(false))
                .andExpect(jsonPath("$.data.reason").value("Discount has already been used by user"));
    }
}
