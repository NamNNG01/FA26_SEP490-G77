package com.examprep.util.attempt;

import com.examprep.util.diagram.DrawioNormalizer;
import com.fasterxml.jackson.databind.JsonNode;

import java.nio.charset.StandardCharsets;
import java.util.*;

/**
 * The correct answer of a question in words: read from an attempt's display and key snapshots, or, for a
 * CODE question that has no key text, from the languages it allows and its public sample fixtures.
 */
public final class AnswerText {
    public static final Set<String> CHOICE_TYPES = Set.of("SINGLE_CHOICE", "MULTIPLE_CHOICE", "TRUE_FALSE");
    public static final int MAX_STUDENT_ANSWER_CHARS = 10_000;
    public static final int MAX_DIAGRAM_BYTES = 500 * 1024;
    public static final int MAX_DIAGRAM_ELEMENTS = 150;
    private static final int MAX_MODEL_ANSWER_CHARS = 4_000;
    private static final int MAX_RUBRIC_CHARS = 2_000;

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

    /** Student's submitted response in words, formatted from the display snapshot and response JSON. */
    public static String studentAnswer(String type, JsonNode display, JsonNode response) {
        if (response == null || response.isNull() || response.isMissingNode() || response.isEmpty()) {
            return "No answer submitted";
        }
        Map<Long, String> options = new HashMap<>();
        for (JsonNode option : display.path("options")) {
            options.put(option.path("optionId").asLong(), option.path("optionText").asText());
        }
        List<String> parts = new ArrayList<>();
        if (CHOICE_TYPES.contains(type)) {
            response.path("selectedOptionIds").forEach(id -> {
                long optId = id.asLong();
                parts.add(options.getOrDefault(optId, String.valueOf(optId)));
            });
            return parts.isEmpty() ? "No answer submitted" : String.join("; ", parts);
        }
        switch (type) {
            case "ORDERING" -> {
                response.path("orderedOptionIds").forEach(id -> {
                    long optId = id.asLong();
                    parts.add(options.getOrDefault(optId, String.valueOf(optId)));
                });
                return parts.isEmpty() ? "No answer submitted" : String.join(" -> ", parts);
            }
            case "MATCHING" -> {
                response.path("matches").forEach(m ->
                        parts.add(m.path("left").asText() + " -> " + m.path("right").asText()));
                return parts.isEmpty() ? "No answer submitted" : String.join("\n", parts);
            }
            case "FILL_BLANK" -> {
                JsonNode blanks = response.path("blanks");
                if (blanks.isObject()) {
                    blanks.fields().forEachRemaining(entry ->
                            parts.add("Blank " + entry.getKey() + ": " + entry.getValue().asText("")));
                }
                return parts.isEmpty() ? "No answer submitted" : String.join("\n", parts);
            }
            case "CODE" -> {
                String lang = response.path("language").asText("").strip();
                String text = response.path("text").asText("").strip();
                if (text.isEmpty()) return "No answer submitted";
                return lang.isEmpty() ? text : "Language: " + lang + "\n" + text;
            }
            case "ESSAY" -> {
                String text = response.path("text").asText("").strip();
                return text.isEmpty() ? "No answer submitted" : text;
            }
            case "DIAGRAM", "DIAGRAM_ESSAY" -> {
                String text = response.path("text").asText("").strip();
                String xml = response.path("drawioXml").asText("").strip();
                if (xml.isEmpty() && text.isEmpty()) return "No answer submitted";
                String diagramDesc = normalizeDiagram(xml);
                if ("DIAGRAM_ESSAY".equals(type)) {
                    return clipStudentAnswer("Diagram Submission:\n" + diagramDesc
                            + "\n\nEssay Explanation:\n" + (text.isEmpty() ? "(no text submitted)" : text));
                }
                return clipStudentAnswer(text.isEmpty() ? diagramDesc : diagramDesc + "\n" + text);
            }
            default -> {
                return clipStudentAnswer(response.toString());
            }
        }
    }

    /** Wraps a student's answer in {@code <student_answer>} tags and strips any injected closing/opening tags. */
    public static String fenceStudentAnswer(String raw) {
        String sanitized = (raw == null ? "" : raw).replaceAll("(?i)</?\\s*student_answer\\s*>", "");
        return "<student_answer>\n" + sanitized + "\n</student_answer>";
    }

    /**
     * Resolves the rubric reference for Deep Explanation: prefers the attempt/session frozen {@code keySnapshot}
     * rubric, falling back to the live question rubric only when the question version still matches.
     */
    public static String rubricReference(JsonNode keySnapshot, String fallbackLiveRubric, boolean sameVersion) {
        if (keySnapshot != null) {
            JsonNode rubric = keySnapshot.path("rubric");
            if (rubric.path("criteria").isArray() && !rubric.path("criteria").isEmpty()) {
                return clip(rubric.toString(), MAX_RUBRIC_CHARS);
            }
        }
        if (sameVersion && fallbackLiveRubric != null && !fallbackLiveRubric.isBlank()) {
            return clip(fallbackLiveRubric, MAX_RUBRIC_CHARS);
        }
        return "Graded against rubric";
    }

    /** Extracts a normalized diagram and/or sample essay model answer from {@code keySnapshot}, or {@code null}. */
    public static String rubricModelAnswer(String type, JsonNode keySnapshot) {
        if (keySnapshot == null || keySnapshot.isNull() || keySnapshot.isMissingNode()) {
            return null;
        }
        String diagram = null;
        if ("DIAGRAM".equals(type) || "DIAGRAM_ESSAY".equals(type)) {
            String xml = keySnapshot.path("drawioXml").asText("").strip();
            if (!xml.isBlank() && xml.getBytes(StandardCharsets.UTF_8).length <= MAX_DIAGRAM_BYTES) {
                try {
                    diagram = DrawioNormalizer.normalize(xml).text();
                } catch (IllegalArgumentException ignored) {
                    diagram = null;
                }
            }
        }
        String sampleText = null;
        if ("ESSAY".equals(type) || "DIAGRAM_ESSAY".equals(type)) {
            String rawSample = keySnapshot.path("sampleAnswer").asText("").strip();
            if (!rawSample.isBlank()) {
                sampleText = rawSample;
            }
        }
        if (diagram != null && sampleText != null) {
            return clip(diagram + "\n\nSample Essay Answer:\n" + sampleText, MAX_MODEL_ANSWER_CHARS);
        }
        if (diagram != null) {
            return clip(diagram, MAX_MODEL_ANSWER_CHARS);
        }
        if (sampleText != null) {
            return clip(sampleText, MAX_MODEL_ANSWER_CHARS);
        }
        return null;
    }

    private static String normalizeDiagram(String xml) {
        if (xml == null || xml.isBlank()) {
            return "(no diagram submitted)";
        }
        if (xml.getBytes(StandardCharsets.UTF_8).length > MAX_DIAGRAM_BYTES) {
            return "(submitted diagram exceeds size limit)";
        }
        try {
            DrawioNormalizer.Result normalized = DrawioNormalizer.normalize(xml);
            if (normalized.elements() > MAX_DIAGRAM_ELEMENTS) {
                return "(submitted diagram has too many elements to normalize)";
            }
            return normalized.text();
        } catch (IllegalArgumentException ex) {
            return "(the submitted diagram could not be read)";
        }
    }

    private static String clipStudentAnswer(String value) {
        if (value == null || value.length() <= MAX_STUDENT_ANSWER_CHARS) {
            return value;
        }
        return value.substring(0, MAX_STUDENT_ANSWER_CHARS) + "\n...(truncated)";
    }

    private static String clip(String value, int max) {
        return value.length() <= max ? value : value.substring(0, max);
    }

    /** A fixture on one prompt line: the model reads the layout, so an embedded newline is escaped. */
    private static String oneLine(String value) {
        if (value == null) return "";
        return value.strip().replace("\r\n", "\n").replace('\r', '\n').replace("\n", "\\n");
    }
}
