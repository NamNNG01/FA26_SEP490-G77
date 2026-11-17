package com.examprep.controllers;

import com.examprep.dto.AdminDiscountDtos.*;
import com.examprep.dto.FlashcardImportDtos.*;
import com.examprep.entities.*;
import com.examprep.repositories.*;
import com.fasterxml.jackson.databind.ObjectMapper;
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

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

import static com.examprep.controllers.student.Fixtures.as;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class AdminDiscountAndFlashcardComprehensiveTest {

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper objectMapper;
    @Autowired DiscountRepository discountRepository;
    @Autowired DeckRepository deckRepository;
    @Autowired UserRepository userRepository;
    @Autowired UserDiscountRepository userDiscountRepository;
    @Autowired ContestRewardRepository contestRewardRepository;
    @Autowired ExamRepository examRepository;
    @Autowired ContestRepository contestRepository;

    User admin, student;
    Discount discount;
    Deck deck;

    @BeforeEach void setUp() {
        admin = User.builder().email("admin_comp@test.com").fullName("Admin Comp").passwordHash("hash").roleName(User.ROLE_ADMIN).build();
        userRepository.save(admin);

        student = User.builder().email("student_comp@test.com").fullName("Student Comp").passwordHash("hash").roleName(User.ROLE_STUDENT).build();
        userRepository.save(student);

        discount = Discount.builder()
                .code("COMP50")
                .name("Comprehensive 50%")
                .discountType("PERCENT")
                .percent(BigDecimal.valueOf(50))
                .usageLimit(100)
                .usedCount(2)
                .isActive(true)
                .appliesTo("ALL")
                .build();
        discountRepository.save(discount);

        deck = Deck.builder()
                .user(student)
                .title("Comp Deck")
                .isPublic(false)
                .build();
        deckRepository.save(deck);
    }

    @Test void testDiscountListFilteringAndPagination() throws Exception {
        mvc.perform(get("/api/v1/admin/discounts")
                .param("page", "0")
                .param("size", "10")
                .param("keyword", "comp50")
                .param("discountType", "PERCENT")
                .param("isActive", "true")
                .with(as(admin)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalElements").value(1));
    }

    @Test void testDiscountListFiltersFixedAmount() throws Exception {
        Discount fixedDiscount = Discount.builder()
                .code("FIXED50K")
                .name("Fixed 50K")
                .discountType("FIXED_AMOUNT")
                .value(BigDecimal.valueOf(50000))
                .usageLimit(10)
                .usedCount(0)
                .isActive(true)
                .appliesTo("ALL")
                .build();
        discountRepository.save(fixedDiscount);

        mvc.perform(get("/api/v1/admin/discounts")
                .param("page", "0")
                .param("size", "10")
                .param("discountType", "FIXED_AMOUNT")
                .with(as(admin)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalElements").value(1))
                .andExpect(jsonPath("$.data.content[0].discountType").value("FIXED_AMOUNT"));
    }

    @Test void testDiscountListFiltersValidityBeforePagination() throws Exception {
        for (int i = 1; i <= 3; i++) {
            discountRepository.save(Discount.builder()
                    .code("EXPIRED" + i)
                    .name("Expired " + i)
                    .discountType("PERCENT")
                    .percent(BigDecimal.TEN)
                    .usageLimit(10)
                    .usedCount(0)
                    .isActive(true)
                    .expiresAt(Instant.now().minusSeconds(i))
                    .appliesTo("ALL")
                    .build());
        }

        mvc.perform(get("/api/v1/admin/discounts")
                .param("page", "0")
                .param("size", "2")
                .param("validity", "EXPIRED")
                .with(as(admin)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalElements").value(3))
                .andExpect(jsonPath("$.data.content.length()").value(2))
                .andExpect(jsonPath("$.data.content[0]").isNotEmpty())
                .andExpect(jsonPath("$.data.content[1]").isNotEmpty());
    }

    @Test void testDiscountDetailFindsContestsByDiscountId() throws Exception {
        Exam exam = Exam.builder()
                .createdBy(admin)
                .title("Contest exam")
                .generationType("MANUAL")
                .durationMinutes(30)
                .build();
        Contest contest = Contest.builder()
                .exam(exam)
                .createdBy(admin)
                .title("Contest using discount")
                .durationMinutes(30)
                .startTime(Instant.now().minusSeconds(60))
                .endTime(Instant.now().plusSeconds(3600))
                .status("PUBLISHED")
                .build();
        examRepository.save(exam);
        contestRepository.save(contest);
        contestRewardRepository.save(ContestReward.builder()
                .contest(contest)
                .discount(discount)
                .rankPosition(1)
                .build());

        mvc.perform(get("/api/v1/admin/discounts/" + discount.getDiscountId())
                .with(as(admin)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.usedInContests[0].title").value("Contest using discount"));
    }

    @Test void testDiscountPaginationRejectsInvalidValues() throws Exception {
        mvc.perform(get("/api/v1/admin/discounts")
                .param("page", "-1")
                .with(as(admin)))
                .andExpect(status().isBadRequest());

        mvc.perform(get("/api/v1/admin/discounts/" + discount.getDiscountId() + "/assignments")
                .param("size", "0")
                .with(as(admin)))
                .andExpect(status().isBadRequest());
    }

    @Test void testDiscountRejectsInvalidAppliesTo() throws Exception {
        DiscountWriteRequest invalidRequest = new DiscountWriteRequest(
                "BADAPPLY", "Invalid appliesTo", null, "PERCENT",
                BigDecimal.valueOf(20), null, null, "INVALID", 10, null, null, true
        );

        mvc.perform(post("/api/v1/admin/discounts")
                .with(as(admin))
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(invalidRequest)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.data.code").value("VALIDATION_FAILED"));
    }

    @Test void testDiscountDetailNotFound() throws Exception {
        mvc.perform(get("/api/v1/admin/discounts/999999")
                .with(as(admin)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.data.code").value("DISCOUNT_NOT_FOUND"));
    }

    @Test void testDiscountCreateValidationAndConflict() throws Exception {
        DiscountWriteRequest invalidReq = new DiscountWriteRequest(
                "AB", "Invalid", null, "PERCENT",
                BigDecimal.valueOf(150), null, null, "ALL", 0, null, null, true
        );
        mvc.perform(post("/api/v1/admin/discounts")
                .with(as(admin))
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(invalidReq)))
                .andExpect(status().isBadRequest());

        // Duplicate code conflict
        DiscountWriteRequest dupReq = new DiscountWriteRequest(
                "COMP50", "Duplicate", null, "PERCENT",
                BigDecimal.valueOf(20), null, null, "ALL", 10, null, null, true
        );
        mvc.perform(post("/api/v1/admin/discounts")
                .with(as(admin))
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(dupReq)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.data.code").value("DISCOUNT_CODE_EXISTS"));
    }

    @Test void testDiscountUpdateLockedFields() throws Exception {
        // Assign a user discount so it is locked
        UserDiscount ud = UserDiscount.builder().user(student).discount(discount).isUsed(false).build();
        userDiscountRepository.save(ud);

        DiscountWriteRequest updateReq = new DiscountWriteRequest(
                "COMP50", "Updated Name", null, "FIXED_AMOUNT", // changing type when locked -> 409 / 422
                BigDecimal.valueOf(50000), null, null, "ALL", 10, null, null, true
        );

        mvc.perform(put("/api/v1/admin/discounts/" + discount.getDiscountId())
                .with(as(admin))
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(updateReq)))
                .andExpect(status().isConflict());
    }

    @Test void testDiscountAssignmentsAndStatus() throws Exception {
        userDiscountRepository.save(UserDiscount.builder()
                .user(student)
                .discount(discount)
                .isUsed(false)
                .build());

        mvc.perform(get("/api/v1/admin/discounts/" + discount.getDiscountId() + "/assignments")
                .with(as(admin)))
                .andExpect(status().isOk());

        StatusUpdateRequest statusReq = new StatusUpdateRequest(false);
        mvc.perform(patch("/api/v1/admin/discounts/" + discount.getDiscountId() + "/status")
                .with(as(admin))
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(statusReq)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.isActive").value(false));
    }

    @Test void testFlashcardTemplatesAndBulk() throws Exception {
        mvc.perform(get("/api/v1/flashcards/import/template")
                .param("format", "docx")
                .with(as(student)))
                .andExpect(status().isOk());

        BulkSaveRequest bulkReq = new BulkSaveRequest(
                deck.getDeckId(),
                null,
                "IMPORT",
                null,
                true,
                List.of(new CardInput("Java", "Programming Language"), new CardInput("Java", "Programming Language")) // duplicate
        );

        mvc.perform(post("/api/v1/flashcards/bulk")
                .with(as(student))
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(bulkReq)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.createdCount").value(1))
                .andExpect(jsonPath("$.data.skippedDuplicateCount").value(1));
    }
}
