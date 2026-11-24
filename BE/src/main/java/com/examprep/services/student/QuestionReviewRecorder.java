package com.examprep.services.student;

import com.examprep.entities.AnswerOption;
import com.examprep.entities.Question;
import com.examprep.entities.StudentQuestionReview;
import com.examprep.repositories.AnswerOptionRepository;
import com.examprep.repositories.StudentQuestionReviewRepository;
import com.examprep.repositories.UserRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * The one place a graded answer reaches the mistake notebook (question_review): exam submit, code judge, essay grading
 * and Module Practice all call it. Only depends on repositories, so the attempt services can use it without a cycle.
 */
@Component
@RequiredArgsConstructor
public class QuestionReviewRecorder {
    public static final String WRONG = "WRONG_BOOKMARKED";
    public static final String ANSWERED = "ANSWERED_BOOKMARKED";
    /** Right answers in a row that take a question out of the wrong list. */
    public static final int RESOLVE_AFTER = 2;
    private static final int CHOICE_MAX = 500;

    private final StudentQuestionReviewRepository reviews;
    private final UserRepository users;
    private final AnswerOptionRepository options;
    private final ObjectMapper json;

    /**
     * A wrong answer opens (or reopens) the row and stores what was answered; a right answer only advances a row
     * that is already wrong, and RESOLVE_AFTER of them in a row turn it back to ANSWERED (it stays if bookmarked).
     */
    @Transactional
    public void record(Long userId, Question question, boolean correct, String response) {
        if (userId == null || question == null) return;
        Instant now = Instant.now();
        StudentQuestionReview row = reviews.findByStudent_UserIdAndQuestion_QuestionId(userId, question.getQuestionId()).orElse(null);
        if (correct && row == null) return;
        if (!correct && row == null) {
            users.findForUpdate(userId);
            row = reviews.findByStudent_UserIdAndQuestion_QuestionId(userId, question.getQuestionId()).orElse(null);
        }
        StudentQuestionReview updated = applyOutcome(userId, question, correct, response, null, row, now);
        if (updated != null) {
            reviews.save(updated);
        }
    }

    public record ReviewEntry(Question question, boolean correct, String response) {}

    /**
     * Batch version of {@link #record} for exam submission: loads existing reviews, user lock (if any new wrong row),
     * and option texts in bulk instead of per-question queries.
     */
    @Transactional
    public void recordBatch(Long userId, List<ReviewEntry> entries) {
        if (userId == null || entries == null || entries.isEmpty()) return;
        Instant now = Instant.now();
        List<Long> questionIds = entries.stream()
                .map(e -> e.question() == null ? null : e.question().getQuestionId())
                .filter(java.util.Objects::nonNull)
                .distinct()
                .toList();
        if (questionIds.isEmpty()) return;

        Map<Long, StudentQuestionReview> byQuestion = reviews
                .findByStudent_UserIdAndQuestion_QuestionIdIn(userId, questionIds).stream()
                .collect(Collectors.toMap(r -> r.getQuestion().getQuestionId(), r -> r, (a, b) -> a));

        boolean needsNewWrongRow = entries.stream().anyMatch(e ->
                e.question() != null && !e.correct() && !byQuestion.containsKey(e.question().getQuestionId()));
        if (needsNewWrongRow) {
            users.findForUpdate(userId);
            reviews.findByStudent_UserIdAndQuestion_QuestionIdIn(userId, questionIds)
                    .forEach(r -> byQuestion.put(r.getQuestion().getQuestionId(), r));
        }

        Set<String> choiceTypes = Set.of("SINGLE_CHOICE", "MULTIPLE_CHOICE", "TRUE_FALSE", "ORDERING");
        List<Long> choiceQuestionIds = entries.stream()
                .filter(e -> e.question() != null && !e.correct()
                        && e.response() != null && !e.response().isBlank()
                        && choiceTypes.contains(e.question().getQuestionType()))
                .map(e -> e.question().getQuestionId())
                .distinct()
                .toList();
        Map<Long, String> loadedOptionTexts = choiceQuestionIds.isEmpty() ? Map.of() : optionTexts(choiceQuestionIds);

        List<StudentQuestionReview> toSave = new ArrayList<>();
        for (ReviewEntry entry : entries) {
            Question question = entry.question();
            if (question == null) continue;
            Long qId = question.getQuestionId();
            StudentQuestionReview updated = applyOutcome(
                    userId, question, entry.correct(), entry.response(), loadedOptionTexts, byQuestion.get(qId), now);
            if (updated != null) {
                byQuestion.put(qId, updated);
                toSave.add(updated);
            }
        }
        if (!toSave.isEmpty()) {
            reviews.saveAll(toSave);
        }
    }

    private StudentQuestionReview applyOutcome(Long userId, Question question, boolean correct, String response,
                                               Map<Long, String> preloadedOptionTexts, StudentQuestionReview row,
                                               Instant now) {
        if (correct) {
            if (row == null) return null;
            row.setLastPracticedAt(now);
            if (WRONG.equals(row.getStatus())) {
                row.setCorrectStreak(row.getCorrectStreak() + 1);
                if (row.getCorrectStreak() >= RESOLVE_AFTER) row.setStatus(ANSWERED);
            }
            return row;
        }
        if (row == null) {
            row = StudentQuestionReview.builder().student(users.getReferenceById(userId)).question(question)
                    .bookmark(false).wrongCount(0).firstWrongAt(now).build();
        }
        row.setStatus(WRONG);
        row.setWrongCount(row.getWrongCount() + 1);
        row.setCorrectStreak(0);
        row.setLastWrongChoice(preloadedOptionTexts != null
                ? (response == null || response.isBlank() ? "(blank)" : describe(question, response, preloadedOptionTexts))
                : describe(question, response));
        row.setLastPracticedAt(now);
        return row;
    }

    /** Rubric answers (essay/code/diagram) have points, not a verdict: half the question's points or more counts as right. */
    public static boolean rubricPassed(BigDecimal score, BigDecimal maxPoints) {
        if (score == null) return false;
        if (maxPoints == null || maxPoints.signum() <= 0) return score.signum() > 0;
        return score.multiply(BigDecimal.valueOf(2)).compareTo(maxPoints) >= 0;
    }

    /** The student's answer as a person reads it: option texts, blanks, pairs or the typed text. */
    String describe(Question question, String response) {
        if (response == null || response.isBlank()) return "(blank)";
        boolean choice = Set.of("SINGLE_CHOICE", "MULTIPLE_CHOICE", "TRUE_FALSE", "ORDERING").contains(question.getQuestionType());
        return describe(question, response, choice ? optionTexts(List.of(question.getQuestionId())) : Map.of());
    }

    /** As {@link #describe(Question, String)}, with option texts already loaded by {@link #optionTexts}. */
    public String describe(Question question, String response, Map<Long, String> optionTexts) {
        JsonNode r = read(response);
        String text = r == null ? "" : switch (question.getQuestionType() == null ? "" : question.getQuestionType()) {
            case "SINGLE_CHOICE", "MULTIPLE_CHOICE", "TRUE_FALSE" -> texts(r.path("selectedOptionIds"), optionTexts, ", ");
            case "ORDERING" -> texts(r.path("orderedOptionIds"), optionTexts, " → ");
            case "FILL_BLANK" -> blanks(r.path("blanks"));
            case "MATCHING" -> matches(r.path("matches"));
            case "DIAGRAM" -> r.path("drawioXml").asText("").isBlank() ? "" : "(drawing)";
            case "DIAGRAM_ESSAY" -> {
                String answerText = r.path("text").asText("");
                boolean hasDrawing = !r.path("drawioXml").asText("").isBlank();
                yield hasDrawing ? (answerText.isBlank() ? "(drawing)" : answerText + " (drawing)") : answerText;
            }
            default -> r.path("text").asText("");
        };
        return clip(text, "(blank)");
    }

    /** The expected answer from an attempt's key snapshot; empty for rubric types, which have no single answer. */
    public String describeKey(String keySnapshot, Map<Long, String> optionTexts) {
        JsonNode key = read(keySnapshot);
        if (key == null) return "";
        List<String> parts = new ArrayList<>();
        if (!key.path("correctOptionIds").isEmpty()) parts.add(texts(key.path("correctOptionIds"), optionTexts, ", "));
        if (!key.path("correctOrder").isEmpty()) parts.add(texts(key.path("correctOrder"), optionTexts, " → "));
        key.path("blanks").forEach(b -> {
            List<String> accepted = new ArrayList<>();
            b.path("accepted").forEach(a -> accepted.add(a.asText()));
            parts.add("(" + b.path("index").asText() + ") " + String.join(" / ", accepted));
        });
        if (!key.path("pairs").isEmpty()) parts.add(matches(key.path("pairs")));
        return clip(String.join("; ", parts), "");
    }

    /** optionId -> option text of the given questions, in one query. */
    public Map<Long, String> optionTexts(Collection<Long> questionIds) {
        if (questionIds.isEmpty()) return Map.of();
        return options.findByQuestionIds(questionIds).stream()
                .collect(Collectors.toMap(AnswerOption::getOptionId, AnswerOption::getOptionText, (a, b) -> a));
    }

    private static String texts(JsonNode ids, Map<Long, String> optionTexts, String separator) {
        List<String> texts = new ArrayList<>();
        ids.forEach(id -> texts.add(optionTexts.getOrDefault(id.asLong(), "#" + id.asText())));
        return String.join(separator, texts);
    }

    private static String clip(String text, String whenEmpty) {
        text = text == null ? "" : text.strip();
        if (text.isEmpty()) return whenEmpty;
        return text.length() > CHOICE_MAX ? text.substring(0, CHOICE_MAX) : text;
    }

    private static String blanks(JsonNode blanks) {
        List<String> parts = new ArrayList<>();
        blanks.fields().forEachRemaining(e -> {
            JsonNode v = e.getValue();
            List<String> values = new ArrayList<>();
            if (v.isArray()) v.forEach(x -> values.add(x.asText()));
            else values.add(v.asText());
            parts.add("(" + e.getKey() + ") " + String.join(" / ", values));
        });
        return String.join("; ", parts);
    }

    private static String matches(JsonNode matches) {
        List<String> parts = new ArrayList<>();
        matches.forEach(m -> parts.add(m.path("left").asText() + " → " + m.path("right").asText()));
        return String.join("; ", parts);
    }

    private JsonNode read(String response) {
        if (response == null || response.isBlank()) return null;
        try {
            return json.readTree(response);
        } catch (Exception e) {
            return json.createObjectNode().put("text", response); // a legacy plain-text answer
        }
    }
}
