package com.examprep.controllers.student;

import com.examprep.entities.*;
import com.examprep.services.student.CardImportService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.EntityManager;
import org.apache.poi.xssf.usermodel.XSSFSheet;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.transaction.annotation.Transactional;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;

import static com.examprep.controllers.student.Fixtures.as;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** FC-07 / FC-11. The background step is driven by hand (tests roll back, so after-commit never fires). */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class CardImportApiIntegrationTest {
    @Autowired MockMvc mvc;
    @Autowired EntityManager em;
    @Autowired ObjectMapper json;
    @Autowired CardImportService imports;
    Fixtures f;
    User student, other;
    Deck deck;

    @BeforeEach void setUp() {
        f = new Fixtures(em);
        student = f.account(User.ROLE_STUDENT);
        other = f.account(User.ROLE_STUDENT);
        deck = Deck.builder().user(student).title("Mine").isPublic(false).build();
        em.persist(deck);
        em.flush();
    }

    @Test void csvImportCompletesWithErrorRows() throws Exception {
        String csv = "﻿front,back,code_language,code_body\n"
                + "Encapsulation,\"Đóng gói, che giấu\",,\n"
                + ",missing front,,\n"
                + "\"Poly\nmorphism\",Đa hình,,\n";
        JsonNode started = data(upload(deck.getDeckId(), "cards.csv", csv.getBytes(StandardCharsets.UTF_8), student)
                .andExpect(status().isAccepted()));
        assertEquals("PROCESSING", started.path("status").asText());
        assertEquals(3, started.path("totalRows").asInt());
        long importId = started.path("importId").asLong();

        poll(deck.getDeckId(), importId, student).andExpect(status().isOk()).andExpect(header().string("Retry-After", "2"))
                .andExpect(jsonPath("$.data.status").value("PROCESSING")).andExpect(jsonPath("$.data.errorRows").doesNotExist());

        imports.process(importId);
        poll(deck.getDeckId(), importId, student).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("COMPLETED")).andExpect(jsonPath("$.data.progress").value(100))
                .andExpect(jsonPath("$.data.successCount").value(2)).andExpect(jsonPath("$.data.totalRows").value(3))
                .andExpect(jsonPath("$.data.errorRows.length()").value(1)).andExpect(jsonPath("$.data.errorRows[0].row").value(3));
        List<Flashcard> saved = em.createQuery("select f from Flashcard f where f.deck = :d order by f.position", Flashcard.class)
                .setParameter("d", deck).getResultList();
        assertEquals(List.of("Encapsulation", "Poly\nmorphism"), saved.stream().map(Flashcard::getFrontText).toList());
        assertEquals("Đóng gói, che giấu", saved.get(0).getBackText());
        assertEquals(List.of(1, 2), saved.stream().map(Flashcard::getPosition).toList());
    }

    @Test void xlsxImportByMagicBytes() throws Exception {
        XSSFWorkbook book = new XSSFWorkbook();
        XSSFSheet sheet = book.createSheet();
        sheet.createRow(0).createCell(0).setCellValue("Back");
        sheet.getRow(0).createCell(1).setCellValue("FRONT");
        sheet.createRow(1).createCell(0).setCellValue("answer");
        sheet.getRow(1).createCell(1).setCellValue("=question");
        sheet.createRow(2); // blank row is skipped
        sheet.createRow(3).createCell(0).setCellValue("hidden back");
        sheet.getRow(3).createCell(1).setCellValue("hidden front");
        sheet.getRow(3).setZeroHeight(true);
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        book.write(out);
        JsonNode started = data(upload(deck.getDeckId(), "cards.csv", out.toByteArray(), student).andExpect(status().isAccepted()));
        assertEquals(1, started.path("totalRows").asInt());
        imports.process(started.path("importId").asLong());
        Flashcard card = em.createQuery("select f from Flashcard f where f.deck = :d", Flashcard.class).setParameter("d", deck).getSingleResult();
        assertEquals("=question", card.getFrontText());
        assertEquals("answer", card.getBackText());
    }

    @Test void pdfRenamedToCsv400() throws Exception {
        upload(deck.getDeckId(), "cards.csv", "%PDF-1.7\n%âã\n1 0 obj".getBytes(StandardCharsets.ISO_8859_1), student)
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.data.code").value("UNSUPPORTED_FILE_TYPE"));
        upload(deck.getDeckId(), "cards.xlsx", new byte[]{'P', 'K', 3, 4, 0, 0, 1, 2}, student)
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.data.code").value("UNSUPPORTED_FILE_TYPE"));
    }

    @Test void over5MB413() throws Exception {
        byte[] big = new byte[5 * 1024 * 1024 + 1];
        java.util.Arrays.fill(big, (byte) 'a');
        upload(deck.getDeckId(), "cards.csv", big, student)
                .andExpect(status().isPayloadTooLarge()).andExpect(jsonPath("$.data.code").value("FILE_TOO_LARGE"));
    }

    @Test void missingHeaderOrTooManyRows400() throws Exception {
        upload(deck.getDeckId(), "cards.csv", "a,b\nc,d\n".getBytes(StandardCharsets.UTF_8), student).andExpect(status().isBadRequest());
        upload(deck.getDeckId(), "cards.csv", "front,back\n".getBytes(StandardCharsets.UTF_8), student).andExpect(status().isBadRequest());
        StringBuilder many = new StringBuilder("front,back\n");
        for (int i = 0; i < 2001; i++) many.append("f").append(i).append(",b\n");
        upload(deck.getDeckId(), "cards.csv", many.toString().getBytes(StandardCharsets.UTF_8), student).andExpect(status().isBadRequest());
    }

    @Test void ownerOnlyAndImportMustBelongToDeck() throws Exception {
        byte[] csv = "front,back\na,b\n".getBytes(StandardCharsets.UTF_8);
        upload(deck.getDeckId(), "cards.csv", csv, other).andExpect(status().isForbidden());
        long importId = data(upload(deck.getDeckId(), "cards.csv", csv, student)).path("importId").asLong();
        poll(deck.getDeckId(), importId, other).andExpect(status().isForbidden());
        Deck second = Deck.builder().user(student).title("Second").isPublic(false).build();
        em.persist(second);
        em.flush();
        poll(second.getDeckId(), importId, student).andExpect(status().isNotFound());
        poll(deck.getDeckId(), Long.MAX_VALUE, student).andExpect(status().isNotFound());
    }

    ResultActions upload(Long deckId, String name, byte[] bytes, User actor) throws Exception {
        return mvc.perform(multipart("/api/v1/student/decks/" + deckId + "/cards/import")
                .file(new MockMultipartFile("file", name, "application/octet-stream", bytes)).with(as(actor)));
    }

    ResultActions poll(Long deckId, long importId, User actor) throws Exception {
        return mvc.perform(get("/api/v1/student/decks/" + deckId + "/imports/" + importId).with(as(actor)));
    }

    JsonNode data(ResultActions result) throws Exception {
        return json.readTree(result.andReturn().getResponse().getContentAsString()).path("data");
    }
}
