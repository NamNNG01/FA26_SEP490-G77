package com.examprep.validation;

import com.examprep.dto.question.AnswerOptionDto;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class QuestionValidatorTest {

    private QuestionValidator validator;

    @BeforeEach
    void setUp() {
        validator = new QuestionValidator(new ObjectMapper());
    }

    @Test
    void testSanitize() {
        String input = "<script>alert('xss')</script>Hello <b>world</b>";
        String sanitized = validator.sanitize(input);
        assertEquals("Hello <b>world</b>", sanitized);
    }

    @Test
    void testUnsupportedType() {
        QuestionPayload payload = QuestionPayload.builder()
                .questionType("CODE")
                .content("Valid content")
                .build();
        List<ValidationError> errors = validator.validate(payload);
        assertFalse(errors.isEmpty());
        assertEquals("questionType", errors.get(0).getPath());
        assertEquals("Question type not supported yet", errors.get(0).getMessage());
    }

    @Test
    void testSingleChoiceHappyPath() {
        QuestionPayload payload = QuestionPayload.builder()
                .questionType("SINGLE_CHOICE")
                .difficulty("EASY")
                .status("ACTIVE")
                .content("What is 2+2?")
                .options(List.of(
                        AnswerOptionDto.builder().optionText("3").isCorrect(false).orderIndex(0).build(),
                        AnswerOptionDto.builder().optionText("4").isCorrect(true).orderIndex(1).build()
                ))
                .build();
        List<ValidationError> errors = validator.validate(payload);
        assertTrue(errors.isEmpty(), "Expected no validation errors, got: " + errors);
    }

    @Test
    void testSingleChoiceErrors() {
        QuestionPayload payload = QuestionPayload.builder()
                .questionType("SINGLE_CHOICE")
                .difficulty("INVALID")
                .status("BAD")
                .content("")
                .options(List.of(
                        AnswerOptionDto.builder().optionText("  ").isCorrect(false).orderIndex(0).build(),
                        AnswerOptionDto.builder().optionText("  ").isCorrect(false).orderIndex(0).build()
                ))
                .build();
        List<ValidationError> errors = validator.validate(payload);
        assertFalse(errors.isEmpty());
        assertTrue(errors.stream().anyMatch(e -> e.getPath().equals("content")));
        assertTrue(errors.stream().anyMatch(e -> e.getPath().equals("difficulty")));
        assertTrue(errors.stream().anyMatch(e -> e.getPath().equals("status")));
        assertTrue(errors.stream().anyMatch(e -> e.getPath().equals("options[0].optionText")));
        assertTrue(errors.stream().anyMatch(e -> e.getPath().equals("options")));
    }

    @Test
    void testMultipleChoiceErrors() {
        QuestionPayload payload = QuestionPayload.builder()
                .questionType("MULTIPLE_CHOICE")
                .content("Select all even numbers")
                .options(List.of(
                        AnswerOptionDto.builder().optionText("2").isCorrect(true).orderIndex(0).build(),
                        AnswerOptionDto.builder().optionText("4").isCorrect(true).orderIndex(1).build()
                ))
                .build();
        List<ValidationError> errors = validator.validate(payload);
        assertFalse(errors.isEmpty());
        assertTrue(errors.stream().anyMatch(e -> e.getMessage().contains("Multiple choice question must have")));
    }

    @Test
    void testMatchingValidation() {
        QuestionPayload payload = QuestionPayload.builder()
                .questionType("MATCHING")
                .content("Match items")
                .answerKey(Map.of("pairs", List.of(
                        Map.of("left", "A", "right", "1")
                )))
                .build();
        List<ValidationError> errors = validator.validate(payload);
        assertFalse(errors.isEmpty());
        assertTrue(errors.stream().anyMatch(e -> e.getMessage().contains("at least 2 pairs")));
    }

    @Test
    void testFillBlankValidation() {
        QuestionPayload payload = QuestionPayload.builder()
                .questionType("FILL_BLANK")
                .content("Python is a {{1}} language.")
                .answerKey(Map.of("blanks", List.of(
                        Map.of("index", 2, "accepted", List.of("compiled"))
                )))
                .build();
        List<ValidationError> errors = validator.validate(payload);
        assertFalse(errors.isEmpty());
        assertTrue(errors.stream().anyMatch(e -> e.getMessage().contains("Blanks in answerKey do not match placeholders")));
    }

    @Test
    void validFillBlankKeepsPlaceholdersThroughSanitizing() {
        assertTrue(validator.sanitize("2 + {{1}} = 5").contains("{{1}}"));
        QuestionPayload payload = QuestionPayload.builder()
                .questionType("FILL_BLANK")
                .content("Python is a {{1}} language.")
                .answerKey(Map.of("blanks", List.of(Map.of("index", 1, "accepted", List.of("dynamic")))))
                .build();
        assertEquals(List.of(), validator.validate(payload));
    }

    @Test
    void testEssayRubricValidation() {
        QuestionPayload payload = QuestionPayload.builder()
                .questionType("ESSAY")
                .content("Write an essay")
                .essayGradingRubric(Map.of("criteria", List.of(
                        Map.of("name", "Grammar", "weight", 0)
                )))
                .build();
        List<ValidationError> errors = validator.validate(payload);
        assertFalse(errors.isEmpty());
        assertTrue(errors.stream().anyMatch(e -> e.getMessage().contains("weight must be greater than 0")));
    }

    @Test
    void testDiagramHappyPath() {
        QuestionPayload payload = QuestionPayload.builder()
                .questionType("DIAGRAM")
                .content("Draw the architecture")
                .questionMetadata(Map.of("drawioXml", "<mxfile>diagram content</mxfile>"))
                .build();
        List<ValidationError> errors = validator.validate(payload);
        assertTrue(errors.isEmpty(), "Expected no validation errors for diagram, got: " + errors);
    }

    @Test
    void testDiagramErrors() {
        // Missing drawioXml
        QuestionPayload payload1 = QuestionPayload.builder()
                .questionType("DIAGRAM")
                .content("Draw")
                .questionMetadata(Map.of())
                .build();
        List<ValidationError> errors1 = validator.validate(payload1);
        assertFalse(errors1.isEmpty());
        assertTrue(errors1.stream().anyMatch(e -> e.getMessage().contains("drawioXml is required")));

        // Invalid start and forbidden DOCTYPE/ENTITY
        QuestionPayload payload2 = QuestionPayload.builder()
                .questionType("DIAGRAM")
                .content("Draw")
                .questionMetadata(Map.of("drawioXml", "<invalid> <!DOCTYPE foo> content</invalid>"))
                .build();
        List<ValidationError> errors2 = validator.validate(payload2);
        assertFalse(errors2.isEmpty());
        assertTrue(errors2.stream().anyMatch(e -> e.getMessage().contains("must start with <mxfile or <mxGraphModel")));
        assertTrue(errors2.stream().anyMatch(e -> e.getMessage().contains("forbidden XML declarations")));

        // Options and answerKey not allowed for diagram
        QuestionPayload payload3 = QuestionPayload.builder()
                .questionType("DIAGRAM")
                .content("Draw")
                .questionMetadata(Map.of("drawioXml", "<mxGraphModel>content</mxGraphModel>"))
                .options(List.of(AnswerOptionDto.builder().optionText("Opt").build()))
                .answerKey("key")
                .build();
        List<ValidationError> errors3 = validator.validate(payload3);
        assertFalse(errors3.isEmpty());
        assertTrue(errors3.stream().anyMatch(e -> e.getMessage().contains("Options are not allowed")));
        assertTrue(errors3.stream().anyMatch(e -> e.getMessage().contains("Answer key is not allowed")));
    }

    @Test
    void testSkillTagRejectedInMetadata() {
        QuestionPayload payload = QuestionPayload.builder()
                .questionType("DIAGRAM")
                .content("Draw")
                .questionMetadata(Map.of("drawioXml", "<mxfile>content</mxfile>", "skillTag", "foo"))
                .build();
        assertTrue(validator.validate(payload).stream().anyMatch(e -> e.getPath().equals("questionMetadata.skillTag")));
    }

    @Test
    void testOrderingHappyPath() {
        QuestionPayload payload = QuestionPayload.builder()
                .questionType("ORDERING")
                .content("Order the steps")
                .options(List.of(
                        AnswerOptionDto.builder().key("k1").optionText("Step 1").orderIndex(0).build(),
                        AnswerOptionDto.builder().key("k2").optionText("Step 2").orderIndex(1).build()
                ))
                .correctOrder(List.of("k2", "k1"))
                .build();
        List<ValidationError> errors = validator.validate(payload);
        assertTrue(errors.isEmpty(), "Expected no validation errors for ordering, got: " + errors);
    }

    @Test
    void testOrderingErrors() {
        QuestionPayload payload = QuestionPayload.builder()
                .questionType("ORDERING")
                .content("Order the steps")
                .options(List.of(
                        AnswerOptionDto.builder().key("k1").optionText("Step 1").isCorrect(false).orderIndex(0).build(),
                        AnswerOptionDto.builder().key("k1").optionText("Step 1").isCorrect(true).orderIndex(0).build()
                ))
                .correctOrder(List.of("k1", "k3"))
                .build();
        List<ValidationError> errors = validator.validate(payload);
        assertFalse(errors.isEmpty());
        assertTrue(errors.stream().anyMatch(e -> e.getMessage().contains("cannot have isCorrect")));
        assertTrue(errors.stream().anyMatch(e -> e.getMessage().contains("Duplicate option key")));
        assertTrue(errors.stream().anyMatch(e -> e.getMessage().contains("Duplicate option text")));
        assertTrue(errors.stream().anyMatch(e -> e.getMessage().contains("Unknown key in correct order")));
    }
}
