package com.examprep.controllers;

import com.examprep.dto.AdminDiscountDtos.*;
import com.examprep.dto.FlashcardImportDtos.*;
import com.examprep.entities.*;
import com.examprep.repositories.*;
import com.examprep.security.UserPrincipal;
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

import static com.examprep.controllers.student.Fixtures.as;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class AdminDiscountAndFlashcardApiTest {

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper objectMapper;
    @Autowired DiscountRepository discountRepository;
    @Autowired DeckRepository deckRepository;
    @Autowired UserRepository userRepository;

    User admin, student;
    Discount discount;
    Deck deck;

    @BeforeEach void setUp() {
        admin = User.builder().email("admin@test.com").fullName("Admin").passwordHash("hash").roleName(User.ROLE_ADMIN).build();
        userRepository.save(admin);

        student = User.builder().email("student@test.com").fullName("Student").passwordHash("hash").roleName(User.ROLE_STUDENT).build();
        userRepository.save(student);

        discount = Discount.builder()
                .code("TEST50")
                .name("Test 50%")
                .discountType("PERCENT")
                .percent(BigDecimal.valueOf(50))
                .usageLimit(100)
                .usedCount(5)
                .isActive(true)
                .appliesTo("ALL")
                .build();
        discountRepository.save(discount);

        deck = Deck.builder()
                .user(student)
                .title("My Deck")
                .isPublic(false)
                .build();
        deckRepository.save(deck);
    }

    @Test void testAdminDiscountsListAndDetail() throws Exception {
        mvc.perform(get("/api/v1/admin/discounts")
                .with(as(admin)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.content[0].code").value("TEST50"));

        mvc.perform(get("/api/v1/admin/discounts/" + discount.getDiscountId())
                .with(as(admin)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.code").value("TEST50"));
    }

    @Test void testAdminDiscountCreateAndUpdate() throws Exception {
        DiscountWriteRequest req = new DiscountWriteRequest(
                "NEWDISC", "New Discount", "Desc", "FIXED_AMOUNT",
                BigDecimal.valueOf(100000), null, null, "ALL", 50, null, null, true
        );

        String json = objectMapper.writeValueAsString(req);

        var result = mvc.perform(post("/api/v1/admin/discounts")
                .with(as(admin))
                .contentType(MediaType.APPLICATION_JSON)
                .content(json))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.code").value("NEWDISC"))
                .andReturn();

        // Test update status
        StatusUpdateRequest statusReq = new StatusUpdateRequest(false);
        mvc.perform(patch("/api/v1/admin/discounts/" + discount.getDiscountId() + "/status")
                .with(as(admin))
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(statusReq)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.isActive").value(false));
    }

    @Test void testFlashcardImportTemplateAndBulk() throws Exception {
        mvc.perform(get("/api/v1/flashcards/import/template")
                .param("format", "xlsx")
                .with(as(student)))
                .andExpect(status().isOk());

        BulkSaveRequest bulkReq = new BulkSaveRequest(
                deck.getDeckId(),
                null,
                "IMPORT",
                null,
                true,
                java.util.List.of(new CardInput("Front 1", "Back 1"), new CardInput("Front 2", "Back 2"))
        );

        mvc.perform(post("/api/v1/flashcards/bulk")
                .with(as(student))
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(bulkReq)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.createdCount").value(2));
    }
}
