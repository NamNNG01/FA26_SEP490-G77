package com.examprep.services;

import com.examprep.dto.ResponseCode;
import com.examprep.dto.attempt.AttemptResponses;
import com.examprep.dto.attempt.Snapshots;
import com.examprep.entities.AnswerOption;
import com.examprep.entities.Exam;
import com.examprep.entities.ExamConfig;
import com.examprep.entities.ExamGroup;
import com.examprep.entities.ExamQuestion;
import com.examprep.entities.Question;
import com.examprep.exceptions.BaseException;
import com.examprep.repositories.AnswerOptionRepository;
import com.examprep.repositories.ExamConfigRepository;
import com.examprep.repositories.ExamGroupRepository;
import com.examprep.repositories.ExamQuestionRepository;
import com.examprep.repositories.QuestionRepository;
import com.examprep.util.attempt.AnswerResponseValidator;
import com.examprep.util.attempt.AttemptShuffler;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Builds the paper of one attempt (SA-01): which questions the student gets, in which order, with
 * which option order, and what is frozen into {@code display_snapshot} / {@code key_snapshot}.
 *
 * <p>Everything here reads only the exam, its links and the question bank — never AI, never the
 * network (spec 0.3 rule 7), and never one row per question (spec 0.3 rule 9).</p>
 */
@Component
@RequiredArgsConstructor
public class AttemptPaperFactory {

    private static final BigDecimal ONE = BigDecimal.ONE;

    private final ExamQuestionRepository examQuestions;
    private final ExamGroupRepository examGroups;
    private final ExamConfigRepository examConfigs;
    private final QuestionRepository questions;
    private final AnswerOptionRepository answerOptions;
    private final ObjectMapper objectMapper;

    /** One row of the paper: a question as the bank holds it and its {@code weight_snapshot}. */
    public record Item(Question question, BigDecimal weight) {
    }

    /** The complete, shuffled paper plus the seed that produced it. */
    public record Paper(List<Item> items, long shuffleSeed) {
    }

    /**
     * Resolves and validates the paper for {@code exam} (spec 6.1 rule 1):
     *
     * <ul>
     *   <li>exam with no question → {@code 422 VALIDATION_ERROR};</li>
     *   <li>question not ACTIVE / not APPROVED / deleted → {@code 409 EXAM_INVALID_QUESTIONS}
     *       carrying those ids;</li>
     *   <li>RANDOM/MIXED rule that can no longer be filled from the bank → the same code with an
     *       empty id list (the bank shrank after publish).</li>
     * </ul>
     */
    public Paper resolve(Exam exam, AttemptShuffler shuffler, long shuffleSeed) {
        Long examId = exam.getExamId();

        Map<Long, Question> fixed = new LinkedHashMap<>();
        Map<Long, BigDecimal> weights = new LinkedHashMap<>();

        // Direct links. ManagerExamServiceImpl also writes one link per group question, so a
        // question can appear twice here and again through the group pass: dedupe on questionId.
        for (ExamQuestion link : examQuestions.findAllByExamIds(List.of(examId))) {
            Question question = link.getQuestion();
            if (question != null && fixed.putIfAbsent(question.getQuestionId(), question) == null) {
                weights.put(question.getQuestionId(), positive(link.getWeight()));
            }
        }

        // Group links, kept in the order the manager attached the groups.
        List<ExamGroup> groups = examGroups.findAllByExamIds(List.of(examId));
        if (!groups.isEmpty()) {
            Map<Long, Integer> groupOrder = new HashMap<>();
            for (int i = 0; i < groups.size(); i++) {
                groupOrder.put(groups.get(i).getGroup().getGroupId(), i);
            }
            List<Long> groupIds = groups.stream().map(group -> group.getGroup().getGroupId()).toList();
            List<Question> groupQuestions = new ArrayList<>(questions.findAllByGroupIds(groupIds));
            groupQuestions.sort((a, b) -> {
                int left = groupOrder.getOrDefault(groupId(a), Integer.MAX_VALUE);
                int right = groupOrder.getOrDefault(groupId(b), Integer.MAX_VALUE);
                return left != right ? Integer.compare(left, right) : Long.compare(a.getQuestionId(), b.getQuestionId());
            });
            for (Question question : groupQuestions) {
                if (fixed.putIfAbsent(question.getQuestionId(), question) == null) {
                    weights.put(question.getQuestionId(), ONE);
                }
            }
        }

        // RANDOM / MIXED: draw every configured rule from the bank, never re-using a question.
        Set<Long> used = new HashSet<>(fixed.keySet());
        List<Draw> draws = new ArrayList<>();
        if (!"STATIC".equals(exam.getGenerationType())) {
            Long courseId = courseId(exam);
            boolean fits = true;
            for (ExamConfig rule : examConfigs.findAllByExamIds(List.of(examId))) {
                int wanted = rule.getNumberOfQuestions() == null ? 0 : Math.max(rule.getNumberOfQuestions(), 0);
                if (wanted == 0) {
                    continue;
                }
                List<Long> pool = questions.findDrawableIds(
                        courseId,
                        rule.getModule() == null ? null : rule.getModule().getModuleId(),
                        rule.getQuestionType(),
                        rule.getDifficulty());
                List<Long> candidates = pool.stream().filter(id -> !used.contains(id)).toList();
                if (candidates.size() < wanted) {
                    fits = false;
                    break;
                }
                List<Long> shuffledPool = shuffler.shuffle(candidates);
                for (int i = 0; i < wanted; i++) {
                    Long drawn = shuffledPool.get(i);
                    if (used.add(drawn)) {
                        draws.add(new Draw(drawn, positive(rule.getWeightEach())));
                    }
                }
            }
            if (!fits) {
                throw new BaseException(ResponseCode.EXAM_INVALID_QUESTIONS,
                        "Some questions of this exam are no longer valid",
                        new AttemptResponses.InvalidQuestions(List.of()));
            }
        }
        if (!draws.isEmpty()) {
            Set<Long> drawnIds = new HashSet<>();
            for (Draw draw : draws) {
                drawnIds.add(draw.questionId());
            }
            Map<Long, Question> drawnQuestions = new HashMap<>();
            for (Question question : questions.findAllByQuestionIdIn(drawnIds)) {
                drawnQuestions.put(question.getQuestionId(), question);
            }
            for (Draw draw : draws) {
                Question question = drawnQuestions.get(draw.questionId());
                if (question != null && fixed.putIfAbsent(question.getQuestionId(), question) == null) {
                    weights.put(question.getQuestionId(), draw.weight());
                }
            }
        }

        List<Item> items = new ArrayList<>();
        for (Question question : fixed.values()) {
            items.add(new Item(question, weights.getOrDefault(question.getQuestionId(), ONE)));
        }

        if (items.isEmpty()) {
            throw new BaseException(ResponseCode.UNPROCESSABLE_VALIDATION_ERROR, "Exam has no questions");
        }

        List<Long> invalid = items.stream()
                .filter(item -> !isValid(item.question()))
                .map(item -> item.question().getQuestionId())
                .toList();
        if (!invalid.isEmpty()) {
            throw new BaseException(ResponseCode.EXAM_INVALID_QUESTIONS,
                    "Some questions of this exam are no longer valid",
                    new AttemptResponses.InvalidQuestions(invalid));
        }

        return new Paper(shuffler.shuffle(items), shuffleSeed);
    }

    /** Every option of the paper in a single query, grouped by question. */
    public Map<Long, List<AnswerOption>> optionsOf(Collection<Question> paperQuestions) {
        Map<Long, List<AnswerOption>> byQuestion = new HashMap<>();
        if (paperQuestions == null || paperQuestions.isEmpty()) {
            return byQuestion;
        }
        Set<Long> ids = new HashSet<>();
        for (Question question : paperQuestions) {
            ids.add(question.getQuestionId());
        }
        for (AnswerOption option : answerOptions.findByQuestionIds(ids)) {
            byQuestion.computeIfAbsent(option.getQuestion().getQuestionId(), key -> new ArrayList<>()).add(option);
        }
        return byQuestion;
    }

    /** Everything needed to grade and to review, frozen at start. Never returned before submit. */
    public Snapshots.KeySnapshot key(Question question, List<AnswerOption> options) {
        String type = question.getQuestionType();

        List<Long> correctOptionIds = null;
        List<Long> correctOrder = null;
        List<Snapshots.Blank> blanks = null;
        List<Snapshots.Pair> pairs = null;
        Snapshots.Rubric rubric = null;
        String drawioXml = null;

        if (("SINGLE_CHOICE".equals(type) || "MULTIPLE_CHOICE".equals(type)
                || "TRUE_FALSE".equals(type)) && options != null) {
            List<Long> correct = new ArrayList<>();
            for (AnswerOption option : options) {
                if (Boolean.TRUE.equals(option.getIsCorrect())) {
                    correct.add(option.getOptionId());
                }
            }
            correctOptionIds = List.copyOf(correct);
        }

        Map<String, Object> answerKey = readMap(question.getAnswerKey());
        if (answerKey != null) {
            correctOrder = longs(answerKey.get("correctOrder"));
            pairs = pairs(answerKey.get("pairs"));
            blanks = blanks(answerKey.get("blanks"));
        }

        if ("ESSAY".equals(type) || "DIAGRAM".equals(type) || "CODE".equals(type)) {
            rubric = rubric(question.getEssayGradingRubric());
        }

        if ("DIAGRAM".equals(type)) {
            Map<String, Object> metadata = readMap(question.getQuestionMetadata());
            if (metadata != null) {
                Object value = metadata.get("drawioXml");
                if (value instanceof String xml && !xml.isBlank()) {
                    drawioXml = xml;
                }
            }
        }

        return new Snapshots.KeySnapshot(
                correctOptionIds, correctOrder, blanks, pairs, rubric, drawioXml);
    }
    /**
     * What the student sees for one question: content, shuffled options or matching columns and
     * the answer space. Never the answer (spec 0.3 rule 4).
     */
    public Snapshots.DisplayQuestion display(Question question,
                                             Snapshots.KeySnapshot key,
                                             List<AnswerOption> options,
                                             int orderIndex,
                                             AttemptShuffler shuffler) {
        String type = question.getQuestionType();
        List<Snapshots.DisplayOption> displayOptions = null;
        Snapshots.Matching matching = null;
        Snapshots.AnswerSpace answerSpace = null;

        if (options != null && !options.isEmpty() && !"MATCHING".equals(type)) {
            List<Snapshots.DisplayOption> natural = new ArrayList<>();
            for (AnswerOption option : options) {
                natural.add(new Snapshots.DisplayOption(option.getOptionId(), option.getOptionText()));
            }
            displayOptions = shuffler.shuffle(natural);
        }

        if ("MATCHING".equals(type) && key != null && key.pairs() != null && !key.pairs().isEmpty()) {
            List<String> lefts = key.pairs().stream().map(Snapshots.Pair::left).toList();
            List<String> rights = key.pairs().stream().map(Snapshots.Pair::right).toList();
            matching = new Snapshots.Matching(shuffler.shuffle(lefts), shuffler.shuffle(rights));
        }

        if ("ESSAY".equals(type) || "CODE".equals(type)) {
            answerSpace = new Snapshots.AnswerSpace(AnswerResponseValidator.ESSAY_MAX_CHARS);
        }

        return new Snapshots.DisplayQuestion(
                question.getQuestionId(),
                orderIndex,
                type,
                question.getContent(),
                displayOptions,
                matching,
                answerSpace);
    }

    /** Serializes a snapshot for its {@code jsonb} column. */
    public String write(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException e) {
            throw new BaseException(ResponseCode.INTERNAL_SERVER_ERROR, "Could not encode attempt snapshot");
        }
    }

    /** Reads a snapshot back. {@code null} or an unparsable document yields {@code null}. */
    public <T> T read(String text, Class<T> type) {
        if (text == null || text.isBlank()) {
            return null;
        }
        try {
            return objectMapper.readValue(text, type);
        } catch (Exception e) {
            return null;
        }
    }

    /** Reads a stored {@code response} column into a tree; {@code null} means "no answer yet". */
    public com.fasterxml.jackson.databind.JsonNode readResponse(String text) {
        if (text == null || text.isBlank()) {
            return null;
        }
        try {
            return objectMapper.readTree(text);
        } catch (Exception e) {
            return null;
        }
    }

    /** Serializes one answer payload for the {@code response} column; empty payloads become null. */
    public String writeResponse(com.fasterxml.jackson.databind.JsonNode value) {
        if (value == null || value.isNull()) {
            return null;
        }
        return write(value);
    }

    private static boolean isValid(Question question) {
        return question != null
                && "ACTIVE".equals(question.getStatus())
                && "APPROVED".equals(question.getApprovalStatus())
                && question.getDeletedAt() == null;
    }

    private static Long groupId(Question question) {
        return question.getGroup() == null ? null : question.getGroup().getGroupId();
    }

    private static BigDecimal positive(BigDecimal value) {
        return value == null || value.signum() <= 0 ? ONE : value;
    }

    private static Long courseId(Exam exam) {
        if (exam.getCourse() != null) {
            return exam.getCourse().getCourseId();
        }
        if (exam.getModule() != null && exam.getModule().getCourse() != null) {
            return exam.getModule().getCourse().getCourseId();
        }
        return null;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> readMap(String text) {
        if (text == null || text.isBlank()) {
            return null;
        }
        try {
            Object parsed = objectMapper.readValue(text, Object.class);
            return parsed instanceof Map ? (Map<String, Object>) parsed : null;
        } catch (Exception e) {
            return null;
        }
    }

    private List<Long> longs(Object value) {
        if (!(value instanceof List<?> list)) {
            return null;
        }
        List<Long> ids = new ArrayList<>();
        for (Object item : list) {
            if (item == null) {
                continue;
            }
            try {
                ids.add(Long.parseLong(item.toString()));
            } catch (NumberFormatException ignored) {
                return null;
            }
        }
        return ids.isEmpty() ? null : List.copyOf(ids);
    }

    private List<Snapshots.Pair> pairs(Object value) {
        if (!(value instanceof List<?> list)) {
            return null;
        }
        List<Snapshots.Pair> parsed = new ArrayList<>();
        for (Object item : list) {
            if (item instanceof Map<?, ?> map) {
                Object left = map.get("left");
                Object right = map.get("right");
                if (left != null && right != null) {
                    parsed.add(new Snapshots.Pair(left.toString(), right.toString()));
                }
            }
        }
        return parsed.isEmpty() ? null : List.copyOf(parsed);
    }

    private List<Snapshots.Blank> blanks(Object value) {
        if (!(value instanceof List<?> list)) {
            return null;
        }
        List<Snapshots.Blank> parsed = new ArrayList<>();
        for (Object item : list) {
            if (!(item instanceof Map<?, ?> map)) {
                continue;
            }
            Object index = map.get("index");
            Object accepted = map.get("accepted");
            if (index == null || !(accepted instanceof List<?> values)) {
                continue;
            }
            try {
                Integer blankIndex = Integer.parseInt(index.toString());
                List<String> acceptedValues = new ArrayList<>();
                for (Object candidate : values) {
                    if (candidate != null) {
                        acceptedValues.add(candidate.toString());
                    }
                }
                if (acceptedValues.isEmpty()) {
                    continue;
                }
                Object caseSensitive = map.get("caseSensitive");
                parsed.add(new Snapshots.Blank(blankIndex, List.copyOf(acceptedValues),
                        caseSensitive != null && Boolean.parseBoolean(caseSensitive.toString())));
            } catch (NumberFormatException ignored) {
                continue;
            }
        }
        return parsed.isEmpty() ? null : List.copyOf(parsed);
    }

    private Snapshots.Rubric rubric(String text) {
        Map<String, Object> map = readMap(text);
        if (map == null || !(map.get("criteria") instanceof List<?> criteria) || criteria.isEmpty()) {
            return null;
        }
        List<Snapshots.Criterion> parsed = new ArrayList<>();
        int position = 1;
        for (Object item : criteria) {
            if (!(item instanceof Map<?, ?> criterion)) {
                continue;
            }
            Object name = criterion.get("name");
            Object weight = criterion.get("weight") != null ? criterion.get("weight") : criterion.get("maxScore");
            if (name == null || weight == null) {
                continue;
            }
            try {
                BigDecimal value = new BigDecimal(weight.toString());
                if (value.signum() <= 0) {
                    continue;
                }
                parsed.add(new Snapshots.Criterion("c" + position++, name.toString(), value));
            } catch (NumberFormatException ignored) {
                continue;
            }
        }
        return parsed.isEmpty() ? null : new Snapshots.Rubric(List.copyOf(parsed));
    }

    private record Draw(Long questionId, BigDecimal weight) {
    }
}
