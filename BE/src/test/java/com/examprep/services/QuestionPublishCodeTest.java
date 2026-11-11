package com.examprep.services;

import com.examprep.dto.question.QuestionStatusRequest;
import com.examprep.entities.CodeQuestionConfig;
import com.examprep.entities.CodeTestCase;
import com.examprep.entities.Question;
import com.examprep.entities.User;
import com.examprep.exceptions.QuestionValidationException;
import com.examprep.util.validation.ValidationError;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Regression for the CODE publish gap (2026-11-11): activating a question validated a payload
 * built from the {@code questions} row alone, so {@code codeConfig} and {@code testCases} — which
 * live in {@code code_question_configs} / {@code code_test_cases} — were always null and every
 * CODE publish through the status endpoints returned 400.
 */
@SpringBootTest
@ActiveProfiles("test")
@Transactional
class QuestionPublishCodeTest {

    @Autowired
    private EntityManager em;

    @Autowired
    private QuestionService questionService;

    @Test
    void activatingCodeQuestionWithConfigAndTestCasesPublishes() {
        User admin = admin();
        Question question = codeQuestion(admin);
        codeConfig(question);
        testCase(question, "5", "5", false, 0);
        testCase(question, "12", "12", true, 1);
        em.flush();

        var detail = questionService.updateQuestionStatus(question.getQuestionId(),
                QuestionStatusRequest.builder().status("ACTIVE").build(), admin);

        assertEquals("ACTIVE", detail.getStatus());
        assertNotNull(detail.getCodeConfig(), "codeConfig must be hydrated from code_question_configs");
        assertEquals(2, detail.getTestCases().size());
    }

    @Test
    void activatingCodeQuestionWithoutTestCasesStillFails() {
        User admin = admin();
        Question question = codeQuestion(admin);
        codeConfig(question);
        em.flush();

        QuestionValidationException error = assertThrows(QuestionValidationException.class,
                () -> questionService.updateQuestionStatus(question.getQuestionId(),
                        QuestionStatusRequest.builder().status("ACTIVE").build(), admin));

        List<String> paths = error.getErrors().stream().map(ValidationError::getPath).toList();
        assertTrue(paths.contains("testCases"), "missing fixtures must still be rejected: " + paths);
        assertEquals("INACTIVE", question.getStatus());
    }

    private User admin() {
        User user = User.builder().email(UUID.randomUUID() + "@example.com").fullName("Admin")
                .passwordHash("test").roleName(User.ROLE_ADMIN).build();
        em.persist(user);
        return user;
    }

    private Question codeQuestion(User author) {
        Question question = Question.builder().createdBy(author).questionType("CODE")
                .difficulty("MEDIUM").content("Print the number read from stdin").status("INACTIVE")
                .approvalStatus("APPROVED").build();
        em.persist(question);
        return question;
    }

    private void codeConfig(Question question) {
        Instant now = Instant.now();
        em.persist(CodeQuestionConfig.builder().questionId(question.getQuestionId())
                .allowedLanguages("[\"JAVA\"]").codeTemplate("public class Main {}")
                .timeLimitMs(5_000).memoryLimitKb(262_144).createdAt(now).updatedAt(now).build());
    }

    private void testCase(Question question, String input, String expected, boolean hidden, int order) {
        em.persist(CodeTestCase.builder().question(question).inputData(input).expectedOutput(expected)
                .hidden(hidden).orderIndex(order).createdAt(Instant.now()).build());
    }
}
