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
