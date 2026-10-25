package com.examprep.util.attempt;

import com.examprep.dto.attempt.Snapshots;
import com.fasterxml.jackson.databind.JsonNode;

import java.math.BigDecimal;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Grades one auto-marked answer against its frozen {@code key_snapshot} (spec 1 and 6.4 rule 3).
 *
 * <p>All-or-nothing: a question only earns its {@code maxPoints} when every part of the answer is
 * right ("đúng hết mới được điểm"). A partially answered question scores 0.</p>
 *
 * <p>The rubric types (ESSAY, DIAGRAM, CODE) are never graded here — they go to
 * {@code PENDING_AI} and are scored later by the AI worker (spec 6.4 rule 3).</p>
 */
public final class AttemptGrader {

    /** Questions whose rubric the AI worker scores. */
    private static final Set<String> RUBRIC_TYPES = Set.of("ESSAY", "DIAGRAM", "CODE");

    private AttemptGrader() {
    }

    /** True for ESSAY/DIAGRAM/CODE: these wait for the AI worker instead of being scored here. */
    public static boolean isRubricType(String questionType) {
        return questionType != null && RUBRIC_TYPES.contains(questionType);
    }

    /** Result of an auto-grade: {@code correct} is {@code null} for questions without one right answer. */
    public record Grade(BigDecimal score, Boolean correct) {
    }

    /**
     * Scores a non-empty answer of a quiz question.
     *
     * @param maxPoints P_q of this question, already rounded for output.
     */
    public static Grade grade(String questionType,
                              JsonNode response,
                              Snapshots.KeySnapshot key,
                              BigDecimal maxPoints) {
        boolean correct = switch (questionType == null ? "" : questionType) {
            case "SINGLE_CHOICE", "MULTIPLE_CHOICE", "TRUE_FALSE" -> choiceCorrect(response, key);
            case "FILL_BLANK" -> fillBlankCorrect(response, key);
            case "MATCHING" -> matchingCorrect(response, key);
            case "ORDERING" -> orderingCorrect(response, key);
            default -> false;
        };
        return new Grade(correct && maxPoints != null ? maxPoints : BigDecimal.ZERO, correct);
    }

    private static boolean choiceCorrect(JsonNode response, Snapshots.KeySnapshot key) {
        Set<Long> selected = new HashSet<>();
        JsonNode ids = response == null ? null : response.get("selectedOptionIds");
        if (ids != null && ids.isArray()) {
            for (JsonNode id : ids) {
                if (id.isNumber()) {
                    selected.add(id.asLong());
                }
            }
        }
        List<Long> correct = key == null ? null : key.correctOptionIds();
        if (correct == null || correct.isEmpty() || selected.size() != correct.size()) {
            return false;
        }
        return selected.containsAll(correct);
    }

    private static boolean fillBlankCorrect(JsonNode response, Snapshots.KeySnapshot key) {
        if (key == null || key.blanks() == null || key.blanks().isEmpty()) {
            return false;
        }
        JsonNode blanks = response == null ? null : response.get("blanks");
        if (blanks == null || !blanks.isObject()) {
            return false;
        }
        for (Snapshots.Blank blank : key.blanks()) {
            JsonNode given = blanks.get(String.valueOf(blank.index()));
            if (given == null || !given.isTextual()) {
                return false;
            }
            if (!accepted(blank, given.asText())) {
                return false;
            }
        }
        return true;
    }

    private static boolean accepted(Snapshots.Blank blank, String given) {
        String value = given == null ? "" : given.trim();
        if (blank.accepted() == null) {
            return false;
        }
        for (String candidate : blank.accepted()) {
            String expected = candidate == null ? "" : candidate.trim();
            if (Boolean.TRUE.equals(blank.caseSensitive()) ? expected.equals(value) : expected.equalsIgnoreCase(value)) {
                return true;
            }
        }
        return false;
    }

    private static boolean matchingCorrect(JsonNode response, Snapshots.KeySnapshot key) {
        if (key == null || key.pairs() == null || key.pairs().isEmpty()) {
            return false;
        }
        JsonNode matches = response == null ? null : response.get("matches");
        if (matches == null || !matches.isArray()) {
            return false;
        }
        Map<String, String> given = new HashMap<>();
        for (JsonNode match : matches) {
            JsonNode left = match == null ? null : match.get("left");
            JsonNode right = match == null ? null : match.get("right");
            if (left != null && left.isTextual() && right != null && right.isTextual()) {
                given.put(left.asText().trim(), right.asText().trim());
            }
        }
        for (Snapshots.Pair pair : key.pairs()) {
            String answer = given.get(pair.left() == null ? "" : pair.left().trim());
            String expected = pair.right() == null ? "" : pair.right().trim();
            if (answer == null || !answer.equalsIgnoreCase(expected)) {
                return false;
            }
        }
        return true;
    }

    private static boolean orderingCorrect(JsonNode response, Snapshots.KeySnapshot key) {
        if (key == null || key.correctOrder() == null || key.correctOrder().isEmpty()) {
            return false;
        }
        JsonNode ids = response == null ? null : response.get("orderedOptionIds");
        if (ids == null || !ids.isArray() || ids.size() != key.correctOrder().size()) {
            return false;
        }
        Iterator<JsonNode> it = ids.elements();
        int position = 0;
        while (it.hasNext()) {
            JsonNode id = it.next();
            if (!id.isNumber() || id.asLong() != key.correctOrder().get(position++)) {
                return false;
            }
        }
        return true;
    }
}
