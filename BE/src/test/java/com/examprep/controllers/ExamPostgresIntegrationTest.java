package com.examprep.controllers;

import com.examprep.entities.Question;
import com.examprep.security.UserPrincipal;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@EnabledIfSystemProperty(named = "postgresTests", matches = "true")
@ActiveProfiles(value = "postgres-test", inheritProfiles = false)
class ExamPostgresIntegrationTest extends ExamApiIntegrationTest {
    @Test void rubricAndMetadataRoundTripAsJsonb() throws Exception {
        String rubric = "{\"criteria\":[{\"name\":\"Ideas\",\"maxScore\":4,\"weight\":100}],\"totalPoints\":4}";
        mvc.perform(put("/api/v1/manager/questions/" + essay.getQuestionId() + "/rubric")
                .with(user(UserPrincipal.create(manager))).contentType(MediaType.APPLICATION_JSON).content(rubric))
                .andExpect(status().isOk());
        assertEquals(4, ((Number) em.createNativeQuery("select (essay_grading_rubric ->> 'totalPoints')::numeric from questions where question_id = :id")
                .setParameter("id", essay.getQuestionId()).getSingleResult()).intValue());
        Long id = essay.getQuestionId();
        em.clear();
        assertEquals(4, json.readTree(em.find(Question.class, id).getEssayGradingRubric()).path("totalPoints").asInt());
        Question created = Question.builder().questionType("CODE").content("JSON insert")
                .questionMetadata("{\"language\":\"java\"}").essayGradingRubric(rubric).build();
        em.persist(created); em.flush();
        assertEquals("java", em.createNativeQuery("select question_metadata ->> 'language' from questions where question_id = :id")
                .setParameter("id", created.getQuestionId()).getSingleResult());
    }
}
