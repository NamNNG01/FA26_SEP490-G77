package com.examprep.util.attempt;

import com.fasterxml.jackson.databind.JsonNode;

import java.util.*;

/** The correct answer of an attempt question in words, read only from its display and key snapshots. */
public final class AnswerText {
    public static final Set<String> CHOICE_TYPES = Set.of("SINGLE_CHOICE", "MULTIPLE_CHOICE", "TRUE_FALSE");

    private AnswerText() {}

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
}
