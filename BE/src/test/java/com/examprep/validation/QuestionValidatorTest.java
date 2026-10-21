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
                .defaultPoints(BigDecimal.ONE)
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
                .defaultPoints(BigDecimal.valueOf(-1))
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
        assertTrue(errors.stream().anyMatch(e -> e.getPath().equals("defaultPoints")));
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
                .defaultPoints(BigDecimal.valueOf(5))
                .essayGradingRubric(Map.of("criteria", List.of(
                        Map.of("name", "Grammar", "maxScore", 2)
                )))
                .build();
        List<ValidationError> errors = validator.validate(payload);
        assertFalse(errors.isEmpty());
        assertTrue(errors.stream().anyMatch(e -> e.getMessage().contains("must equal defaultPoints")));
    }
}
