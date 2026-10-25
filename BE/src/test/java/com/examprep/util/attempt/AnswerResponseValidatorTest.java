package com.examprep.util.attempt;

import com.examprep.dto.attempt.Snapshots;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The response shapes of spec 6.3, one test per question type, plus the rejection detail the FE
 * shows for {@code INVALID_RESPONSE}.
 */
class AnswerResponseValidatorTest {

    private static final ObjectMapper JSON = new ObjectMapper();

    private static final Snapshots.DisplayQuestion SINGLE = question("SINGLE_CHOICE",
            "Pick one",
            List.of(new Snapshots.DisplayOption(12L, "A"), new Snapshots.DisplayOption(14L, "B")),
            null);

    private static final Snapshots.DisplayQuestion MULTIPLE = question("MULTIPLE_CHOICE",
            "Pick many",
            List.of(new Snapshots.DisplayOption(12L, "A"), new Snapshots.DisplayOption(14L, "B")),
            null);

    private static final Snapshots.DisplayQuestion MATCHING = question("MATCHING",
            "Match",
            null,
            new Snapshots.Matching(List.of("HTML", "CSS"), List.of("Markup language", "Style sheet")));

    private static final Snapshots.DisplayQuestion FILL = question("FILL_BLANK",
            "Java classes {{1}} and interfaces {{2}}.",
            null, null);

    private static final Snapshots.DisplayQuestion ORDERING = question("ORDERING",
            "Order",
            List.of(new Snapshots.DisplayOption(88L, "one"), new Snapshots.DisplayOption(85L, "two")),
            null);

    private static final Snapshots.DisplayQuestion ESSAY = question("ESSAY", "Explain", null, null);
    private static final Snapshots.DisplayQuestion DIAGRAM = question("DIAGRAM", "Draw", null, null);

    @Test
    void acceptsEveryDocumentedShape() {
        assertValid(SINGLE, "{\"selectedOptionIds\":[12]}");
        assertValid(MULTIPLE, "{\"selectedOptionIds\":[12,14]}");
        assertValid(MATCHING, "{\"matches\":[{\"left\":\"HTML\",\"right\":\"Markup language\"}]}");
        assertValid(FILL, "{\"blanks\":{\"1\":\"extends\",\"2\":\"implements\"}}");
        assertValid(ORDERING, "{\"orderedOptionIds\":[88,85]}");
        assertValid(ESSAY, "{\"text\":\"Because memory is managed.\"}");
        assertValid(DIAGRAM, "{\"drawioXml\":\"<mxfile></mxfile>\"}");
    }

    @Test
    void anEmptyPayloadMeansNoAnswerInsteadOfAnError() throws Exception {
        assertValid(SINGLE, "null");
        assertValid(SINGLE, "{}");
        assertValid(SINGLE, "{\"selectedOptionIds\":[]}");
        assertValid(ESSAY, "{\"text\":\"\"}");
        assertTrue(AnswerResponseValidator.isEmpty(JSON.createObjectNode()));
        assertTrue(AnswerResponseValidator.isEmpty(null));
        assertTrue(AnswerResponseValidator.isEmpty(JSON.readTree("{\"selectedOptionIds\":[]}")));
        assertTrue(!AnswerResponseValidator.isEmpty(JSON.readTree("{\"selectedOptionIds\":[12]}")));
    }

    @Test
    void singleAndTrueFalseRequireExactlyOneKnownOption() {
        assertInvalid(SINGLE, "{\"selectedOptionIds\":[12,14]}", "exactly one");
        assertInvalid(SINGLE, "{\"selectedOptionIds\":[99]}", "not part of this question");
        assertInvalid(SINGLE, "{\"selectedOptionIds\":\"12\"}", "must be an array");
        assertInvalid(SINGLE, "{\"selectedOptionIds\":[12.5]}", "must contain option ids");
    }

    @Test
    void multipleChoiceRejectsDuplicatesButAllowsOne() {
        assertInvalid(MULTIPLE, "{\"selectedOptionIds\":[12,12]}", "duplicate");
        assertValid(MULTIPLE, "{\"selectedOptionIds\":[12]}");
    }

    @Test
    void matchingMustUseTheDisplayedColumnsAndOneEntryPerLeft() {
        assertValid(MATCHING, "{\"matches\":[]}");
        assertInvalid(MATCHING, "{\"matches\":[{\"left\":\"Ruby\",\"right\":\"Markup language\"}]}",
                "left value is not part of this question");
        assertInvalid(MATCHING, "{\"matches\":[{\"left\":\"HTML\",\"right\":\"Ruby\"}]}",
                "right value is not part of this question");
        assertInvalid(MATCHING, "{\"matches\":[{\"left\":\"HTML\",\"right\":\"Markup language\"},"
                        + "{\"left\":\"HTML\",\"right\":\"Style sheet\"}]}",
                "duplicate left value");
        assertInvalid(MATCHING, "{\"matches\":[{\"left\":\"HTML\"}]}", "non-empty strings");
    }

    @Test
    void fillBlankKeysMustBePlaceholdersOfTheContent() {
        assertValid(FILL, "{\"blanks\":{\"1\":\"extends\"}}");
        assertInvalid(FILL, "{\"blanks\":{\"3\":\"extends\"}}", "not part of this question");
        assertInvalid(FILL, "{\"blanks\":{\"one\":\"extends\"}}", "placeholder number");
        assertInvalid(FILL, "{\"blanks\":{\"1\":3}}", "must be a string");
    }

    @Test
    void orderingMustBeAPermutationOfEveryOption() {
        assertValid(ORDERING, "{\"orderedOptionIds\":[85,88]}");
        assertInvalid(ORDERING, "{\"orderedOptionIds\":[88]}", "every option must appear exactly once");
        assertInvalid(ORDERING, "{\"orderedOptionIds\":[88,88]}", "duplicate option");
        assertInvalid(ORDERING, "{\"orderedOptionIds\":[88,99]}", "not part of this question");
    }

    @Test
    void essayAndDiagramEnforceTheirSizeLimits() {
        String maxEssay = "x".repeat(AnswerResponseValidator.ESSAY_MAX_CHARS);
        assertValid(ESSAY, JSON.createObjectNode().put("text", maxEssay).toString());
        assertInvalid(ESSAY, JSON.createObjectNode().put("text", maxEssay + "x").toString(), "text too long");
        assertInvalid(ESSAY, "{\"text\":5}", "text must be a string");

        String maxXml = "x".repeat(AnswerResponseValidator.DIAGRAM_MAX_BYTES);
        assertValid(DIAGRAM, JSON.createObjectNode().put("drawioXml", maxXml).toString());
        assertInvalid(DIAGRAM, JSON.createObjectNode().put("drawioXml", maxXml + "x").toString(), "too large");
        assertInvalid(DIAGRAM, "{\"drawioXml\":5}", "drawioXml must be a string");
    }

    @Test
    void aNonObjectPayloadIsRejected() {
        assertInvalid(SINGLE, "[12]", "must be a JSON object");
        assertInvalid(ESSAY, "\"answer\"", "must be a JSON object");
    }

    private void assertValid(Snapshots.DisplayQuestion display, String payload) {
        try {
            assertEquals("", AnswerResponseValidator.validate(
                            display.questionType(), JSON.readTree(payload), display).orElse(""),
                    "expected " + payload + " to be accepted");
        } catch (Exception e) {
            throw new AssertionError(e);
        }
    }

    private void assertInvalid(Snapshots.DisplayQuestion display, String payload, String expectedDetail) {
        try {
            String detail = AnswerResponseValidator.validate(
                    display.questionType(), JSON.readTree(payload), display).orElse("");
            assertTrue(detail.contains(expectedDetail),
                    "expected detail containing '" + expectedDetail + "' but got '" + detail + "'");
        } catch (Exception e) {
            throw new AssertionError(e);
        }
    }

    private static Snapshots.DisplayQuestion question(String type,
                                                      String content,
                                                      List<Snapshots.DisplayOption> options,
                                                      Snapshots.Matching matching) {
        return new Snapshots.DisplayQuestion(1L, 1, type, content, options, matching, null);
    }
}
