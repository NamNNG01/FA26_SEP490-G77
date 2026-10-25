package com.examprep.util.attempt;

import com.examprep.dto.attempt.Snapshots;
import com.fasterxml.jackson.databind.JsonNode;

import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.Iterator;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Validates the {@code response} payload of SA-03/SA-04 against the shape the spec defines for
 * each question type (spec 6.3).
 *
 * <p>Validation only ever uses {@code display_snapshot} (what the student was shown) and the
 * structure of {@code key_snapshot} (how many blanks exist) — the correct answer itself is never
 * needed here and never leaves the service.</p>
 *
 * <p>Not matching the table means the draft entry is answered with
 * {@code rejected.reason = INVALID_RESPONSE} and the detail string; the rest of the batch is still
 * stored (spec 6.3).</p>
 */
public final class AnswerResponseValidator {

    /** ESSAY / CODE text limit (spec 6.3). */
    public static final int ESSAY_MAX_CHARS = 10_000;
    /** DIAGRAM payload limit: 500 KB (spec 6.3). */
    public static final int DIAGRAM_MAX_BYTES = 500 * 1024;
    /** Ceiling for every other string inside a response (fill-blank value, matching label). */
    public static final int TEXT_MAX_CHARS = 10_000;

    /** The {@code {{1}}} placeholders a fill-blank question uses in its content. */
    private static final Pattern BLANK_PLACEHOLDER = Pattern.compile("\\{\\{(\\d+)\\}\\}");

    private AnswerResponseValidator() {
    }

    /**
     * @return empty when the payload is acceptable, otherwise the FE-facing detail of
     * {@code INVALID_RESPONSE}.
     */
    public static Optional<String> validate(String questionType,
                                            JsonNode response,
                                            Snapshots.DisplayQuestion display) {
        if (isEmpty(response)) {
            return Optional.empty();
        }
        if (response == null || !response.isObject()) {
            return Optional.of("response must be a JSON object");
        }
        return switch (questionType == null ? "" : questionType) {
            case "SINGLE_CHOICE", "TRUE_FALSE" -> validateSelectedIds(response, display, 1);
            case "MULTIPLE_CHOICE" -> validateSelectedIds(response, display, null);
            case "MATCHING" -> validateMatching(response, display);
            case "FILL_BLANK" -> validateFillBlank(response, display);
            case "ORDERING" -> validateOrdering(response, display);
            case "ESSAY", "CODE" -> validateText(response, "text");
            case "DIAGRAM" -> validateDiagram(response);
            default -> Optional.of("unsupported question type");
        };
    }

    /**
     * True when the student has not really answered: {@code null}, {@code null} JSON, an empty
     * object, or an object whose only fields are empty. Such questions get {@code score = 0} at
     * submit time (spec 6.4 rule 3).
     */
    public static boolean isEmpty(JsonNode response) {
        if (response == null || response.isNull() || response.isMissingNode()) {
            return true;
        }
        if (!response.isObject()) {
            return false;
        }
        Iterator<Map.Entry<String, JsonNode>> fields = response.fields();
        while (fields.hasNext()) {
            Map.Entry<String, JsonNode> field = fields.next();
            JsonNode value = field.getValue();
            if (value == null || value.isNull()) {
                continue;
            }
            if (value.isTextual() && value.asText().isBlank()) {
                continue;
            }
            if ((value.isArray() || value.isObject()) && value.isEmpty()) {
                continue;
            }
            return false;
        }
        // Every field was empty (or there was no field at all).
        return true;
    }

    private static Optional<String> validateSelectedIds(JsonNode response,
                                                        Snapshots.DisplayQuestion display,
                                                        Integer exactSize) {
        JsonNode ids = response.get("selectedOptionIds");
        if (ids == null || !ids.isArray()) {
            return Optional.of("selectedOptionIds must be an array");
        }
        if (exactSize != null && ids.size() != exactSize) {
            return Optional.of("exactly one option must be selected");
        }
        if (ids.isEmpty()) {
            return Optional.empty();
        }
        Set<Long> allowed = optionIds(display);
        Set<Long> seen = new HashSet<>();
        for (JsonNode id : ids) {
            if (!id.isIntegralNumber()) {
                return Optional.of("selectedOptionIds must contain option ids");
            }
            long optionId = id.asLong();
            if (!allowed.contains(optionId)) {
                return Optional.of("option is not part of this question");
            }
            if (!seen.add(optionId)) {
                return Optional.of("duplicate option");
            }
        }
        if (exactSize == null && seen.isEmpty()) {
            return Optional.of("at least one option must be selected");
        }
        return Optional.empty();
    }

    private static Optional<String> validateMatching(JsonNode response, Snapshots.DisplayQuestion display) {
        JsonNode matches = response.get("matches");
        if (matches == null || !matches.isArray()) {
            return Optional.of("matches must be an array");
        }
        if (matches.isEmpty()) {
            return Optional.empty();
        }
        Set<String> lefts = display != null && display.matching() != null && display.matching().lefts() != null
                ? new HashSet<>(display.matching().lefts())
                : Set.of();
        Set<String> rights = display != null && display.matching() != null && display.matching().rights() != null
                ? new HashSet<>(display.matching().rights())
                : Set.of();
        Set<String> seen = new HashSet<>();
        for (JsonNode match : matches) {
            if (!match.isObject()) {
                return Optional.of("each match must be an object with left and right");
            }
            JsonNode left = match.get("left");
            JsonNode right = match.get("right");
            if (left == null || !left.isTextual() || left.asText().isBlank()
                    || right == null || !right.isTextual() || right.asText().isBlank()) {
                return Optional.of("left and right must be non-empty strings");
            }
            if (left.asText().length() > TEXT_MAX_CHARS || right.asText().length() > TEXT_MAX_CHARS) {
                return Optional.of("matching label too long");
            }
            if (!lefts.isEmpty() && !lefts.contains(left.asText())) {
                return Optional.of("left value is not part of this question");
            }
            if (!rights.isEmpty() && !rights.contains(right.asText())) {
                return Optional.of("right value is not part of this question");
            }
            if (!seen.add(left.asText())) {
                return Optional.of("duplicate left value");
            }
        }
        if (!lefts.isEmpty() && seen.size() > lefts.size()) {
            return Optional.of("too many matches");
        }
        return Optional.empty();
    }

    private static Optional<String> validateFillBlank(JsonNode response, Snapshots.DisplayQuestion display) {
        JsonNode blanks = response.get("blanks");
        if (blanks == null || !blanks.isObject()) {
            return Optional.of("blanks must be an object");
        }
        if (blanks.isEmpty()) {
            return Optional.empty();
        }
        Set<Integer> placeholders = placeholders(display == null ? null : display.content());
        Iterator<Map.Entry<String, JsonNode>> fields = blanks.fields();
        while (fields.hasNext()) {
            Map.Entry<String, JsonNode> field = fields.next();
            if (!isIndex(field.getKey())) {
                return Optional.of("blank key must be the placeholder number");
            }
            if (!placeholders.isEmpty() && !placeholders.contains(Integer.parseInt(field.getKey()))) {
                return Optional.of("blank is not part of this question");
            }
            JsonNode value = field.getValue();
            if (value == null || !value.isTextual()) {
                return Optional.of("blank value must be a string");
            }
            if (value.asText().length() > TEXT_MAX_CHARS) {
                return Optional.of("blank value too long");
            }
        }
        return Optional.empty();
    }

    /** The {@code {{n}}} numbers a fill-blank content offers; empty when it has none. */
    private static Set<Integer> placeholders(String content) {
        Set<Integer> indices = new HashSet<>();
        if (content == null) {
            return indices;
        }
        Matcher matcher = BLANK_PLACEHOLDER.matcher(content);
        while (matcher.find()) {
            try {
                indices.add(Integer.parseInt(matcher.group(1)));
            } catch (NumberFormatException ignored) {
                // A placeholder too large for an int cannot be a blank index anyway.
            }
        }
        return indices;
    }

    private static Optional<String> validateOrdering(JsonNode response, Snapshots.DisplayQuestion display) {
        JsonNode ids = response.get("orderedOptionIds");
        if (ids == null || !ids.isArray()) {
            return Optional.of("orderedOptionIds must be an array");
        }
        if (ids.isEmpty()) {
            return Optional.empty();
        }
        Set<Long> allowed = optionIds(display);
        Set<Long> seen = new HashSet<>();
        for (JsonNode id : ids) {
            if (!id.isIntegralNumber()) {
                return Optional.of("orderedOptionIds must contain option ids");
            }
            long optionId = id.asLong();
            if (!allowed.contains(optionId)) {
                return Optional.of("option is not part of this question");
            }
            if (!seen.add(optionId)) {
                return Optional.of("duplicate option");
            }
        }
        if (seen.size() != allowed.size()) {
            return Optional.of("every option must appear exactly once");
        }
        return Optional.empty();
    }

    private static Optional<String> validateText(JsonNode response, String field) {
        JsonNode text = response.get(field);
        if (text == null || !text.isTextual()) {
            return Optional.of(field + " must be a string");
        }
        if (text.asText().length() > ESSAY_MAX_CHARS) {
            return Optional.of("text too long");
        }
        return Optional.empty();
    }

    private static Optional<String> validateDiagram(JsonNode response) {
        JsonNode xml = response.get("drawioXml");
        if (xml == null || !xml.isTextual()) {
            return Optional.of("drawioXml must be a string");
        }
        if (xml.asText().getBytes(StandardCharsets.UTF_8).length > DIAGRAM_MAX_BYTES) {
            return Optional.of("drawioXml too large");
        }
        return Optional.empty();
    }

    private static Set<Long> optionIds(Snapshots.DisplayQuestion display) {
        Set<Long> ids = new HashSet<>();
        if (display != null && display.options() != null) {
            for (Snapshots.DisplayOption option : display.options()) {
                if (option != null && option.optionId() != null) {
                    ids.add(option.optionId());
                }
            }
        }
        return ids;
    }

    private static boolean isIndex(String value) {
        if (value == null || value.isEmpty()) {
            return false;
        }
        for (int i = 0; i < value.length(); i++) {
            if (!Character.isDigit(value.charAt(i))) {
                return false;
            }
        }
        return true;
    }
}
