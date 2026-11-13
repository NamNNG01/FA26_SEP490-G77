package com.examprep.util.attempt;

import com.fasterxml.jackson.databind.JsonNode;

import java.util.*;

/**
 * The correct answer of a question in words: read from an attempt's display and key snapshots, or, for a
 * CODE question that has no key text, from the languages it allows and its public sample fixtures.
 */
public final class AnswerText {
    public static final Set<String> CHOICE_TYPES = Set.of("SINGLE_CHOICE", "MULTIPLE_CHOICE", "TRUE_FALSE");

    private AnswerText() {}

    /** One public sample fixture of a CODE question: what the program is given and what it must print. */
    public record CodeSample(String input, String output) { }

    /** null when the type has no textual key (ESSAY, DIAGRAM) or the key names nothing printable. */
    public static String correctAnswer(String type, JsonNode display, JsonNode key) {
        Map<Long, String> options = new HashMap<>();
        for (JsonNode option : display.path("options")) options.put(option.path("optionId").asLong(), option.path("optionText").asText());
        List<String> parts = new ArrayList<>();
        if (CHOICE_TYPES.contains(type)) {
            key.path("correctOptionIds").forEach(id -> { if (options.containsKey(id.asLong())) parts.add(options.get(id.asLong())); });
            return parts.isEmpty() ? null : String.join("; ", parts);
        }
        switch (type) {
            case "ORDERING" -> key.path("correctOrder").forEach(id -> { if (options.containsKey(id.asLong())) parts.add(options.get(id.asLong())); });
            case "MATCHING" -> key.path("pairs").forEach(p -> parts.add(p.path("left").asText() + " -> " + p.path("right").asText()));
            case "FILL_BLANK" -> key.path("blanks").forEach(b -> {
                List<String> accepted = new ArrayList<>();
                b.path("accepted").forEach(a -> accepted.add(a.asText()));
                parts.add("Blank " + b.path("index").asText() + ": " + String.join(" / ", accepted));
            });
            default -> { }
        }
        if (parts.isEmpty()) return null;
        return String.join("ORDERING".equals(type) ? " -> " : "\n", parts);
    }

    /**
     * The reference of a CODE question: the languages it may be written in and the sample cases the student
     * can see. Hidden fixtures are never part of it, so an explanation cannot reveal them.
     */
    public static String codeAnswer(List<String> languages, List<CodeSample> samples) {
        List<String> parts = new ArrayList<>();
        if (languages != null && !languages.isEmpty()) parts.add("Languages: " + String.join(", ", languages));
        int index = 1;
        if (samples != null) {
            for (CodeSample sample : samples) {
                parts.add("Sample " + index++ + ": input \"" + oneLine(sample.input()) + "\" -> expected output \""
                        + oneLine(sample.output()) + "\"");
            }
        }
        if (index == 1) parts.add("No public sample test case is recorded.");
        return String.join("\n", parts);
    }

    /** A fixture on one prompt line: the model reads the layout, so an embedded newline is escaped. */
    private static String oneLine(String value) {
        if (value == null) return "";
        return value.strip().replace("\r\n", "\n").replace('\r', '\n').replace("\n", "\\n");
    }
}
