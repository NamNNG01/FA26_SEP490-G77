package com.examprep.validation;

import com.examprep.dto.question.AnswerOptionDto;
import com.examprep.exceptions.BadRequestException;
import com.examprep.exceptions.QuestionValidationException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.owasp.html.HtmlPolicyBuilder;
import org.owasp.html.PolicyFactory;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

@Component
@RequiredArgsConstructor
public class QuestionValidator {

    private final ObjectMapper objectMapper;

    private static final PolicyFactory SANITIZER = new HtmlPolicyBuilder()
            .allowElements("b", "i", "u", "strong", "em", "p", "br", "ul", "ol", "li", "span", "code", "pre", "sub", "sup")
            .allowAttributes("class").onElements("span", "code", "pre")
            .toFactory();

    public String sanitize(String input) {
        if (input == null) return null;
        return SANITIZER.sanitize(input);
    }

    public void validateQuestionType(String questionType) {
        if (questionType == null || questionType.trim().isEmpty()) {
            throw new BadRequestException("Question type is required");
        }
        if (questionType.equals("CODE") || questionType.equals("DIAGRAM")) {
            throw new BadRequestException("Question type not supported yet");
        }
        if (!questionType.matches("SINGLE_CHOICE|MULTIPLE_CHOICE|TRUE_FALSE|MATCHING|FILL_BLANK|ESSAY")) {
            throw new BadRequestException("Question type not supported yet");
        }
    }

    public void validateOrThrow(QuestionPayload payload) {
        List<ValidationError> errors = validate(payload, "");
        if (!errors.isEmpty()) {
            throw new QuestionValidationException(errors);
        }
    }

    public void validateOrThrow(QuestionPayload payload, String pathPrefix) {
        List<ValidationError> errors = validate(payload, pathPrefix);
        if (!errors.isEmpty()) {
            throw new QuestionValidationException(errors);
        }
    }

    public List<ValidationError> validate(QuestionPayload payload) {
        return validate(payload, "");
    }

    public List<ValidationError> validate(QuestionPayload payload, String pathPrefix) {
        List<ValidationError> errors = new ArrayList<>();
        if (payload == null) {
            errors.add(new ValidationError(pathPrefix + "payload", "Payload cannot be null"));
            return errors;
        }

        String prefix = pathPrefix != null ? pathPrefix : "";

        // 1. Question Type
        String type = payload.getQuestionType();
        if (type == null || type.trim().isEmpty()) {
            errors.add(new ValidationError(prefix + "questionType", "Question type is required"));
            return errors; // Cannot validate further without type
        }
        if (type.equals("CODE") || type.equals("DIAGRAM") || !type.matches("SINGLE_CHOICE|MULTIPLE_CHOICE|TRUE_FALSE|MATCHING|FILL_BLANK|ESSAY")) {
            errors.add(new ValidationError(prefix + "questionType", "Question type not supported yet"));
            return errors;
        }

        // 2. General fields
        String content = sanitize(payload.getContent());
        if (content == null || content.trim().isEmpty()) {
            errors.add(new ValidationError(prefix + "content", "Content is required"));
        } else if (content.length() > 10000) {
            errors.add(new ValidationError(prefix + "content", "Content exceeds maximum length of 10000 characters"));
        }

        String difficulty = payload.getDifficulty();
        if (difficulty != null && !difficulty.matches("EASY|MEDIUM|HARD")) {
            errors.add(new ValidationError(prefix + "difficulty", "Difficulty must be EASY, MEDIUM, or HARD"));
        }

        String status = payload.getStatus();
        if (status != null && !status.matches("ACTIVE|INACTIVE|DRAFT")) {
            errors.add(new ValidationError(prefix + "status", "Status must be ACTIVE, INACTIVE, or DRAFT"));
        }

        BigDecimal points = payload.getDefaultPoints();
        if (points != null) {
            if (points.compareTo(BigDecimal.ZERO) <= 0 || points.compareTo(new BigDecimal("1000")) > 0) {
                errors.add(new ValidationError(prefix + "defaultPoints", "Default points must be greater than 0 and up to 1000"));
            }
        }

        // 3. Question Metadata validation
        if (payload.getQuestionMetadata() != null) {
            try {
                Map<String, Object> metaMap;
                if (payload.getQuestionMetadata() instanceof Map) {
                    metaMap = (Map<String, Object>) payload.getQuestionMetadata();
                } else {
                    metaMap = objectMapper.convertValue(payload.getQuestionMetadata(), Map.class);
                }
                for (String key : metaMap.keySet()) {
                    if (!key.equals("skillTag") && !key.equals("diagramType") && !key.equals("plantUmlSource")) {
                        errors.add(new ValidationError(prefix + "questionMetadata", "Unknown metadata key: " + key));
                    }
                    if (key.equals("skillTag")) {
                        Object val = metaMap.get(key);
                        if (val != null && (val.toString().length() > 100 || val.toString().trim().isEmpty())) {
                            errors.add(new ValidationError(prefix + "questionMetadata", "skillTag must be a non-empty string up to 100 characters"));
                        }
                    }
                }
            } catch (Exception e) {
                errors.add(new ValidationError(prefix + "questionMetadata", "Invalid question metadata format"));
            }
        }

        // 4. Type specific rules
        boolean hasOptionsType = type.equals("SINGLE_CHOICE") || type.equals("MULTIPLE_CHOICE") || type.equals("TRUE_FALSE");
        boolean noOptionsType = type.equals("MATCHING") || type.equals("FILL_BLANK") || type.equals("ESSAY");

        if (hasOptionsType) {
            if (payload.getAnswerKey() != null) {
                errors.add(new ValidationError(prefix + "answerKey", "Answer key is not allowed for question type " + type));
            }

            List<AnswerOptionDto> opts = payload.getOptions();
            if (opts == null || opts.isEmpty() || opts.size() < 2 || opts.size() > 10) {
                errors.add(new ValidationError(prefix + "options", "Number of options must be between 2 and 10"));
            } else {
                Set<String> normalizedTexts = new HashSet<>();
                Set<Integer> orderIndices = new HashSet<>();

                for (int i = 0; i < opts.size(); i++) {
                    AnswerOptionDto opt = opts.get(i);
                    String optPrefix = prefix + "options[" + i + "].";
                    String optText = sanitize(opt != null ? opt.getOptionText() : null);

                    if (optText == null || optText.trim().isEmpty()) {
                        errors.add(new ValidationError(optPrefix + "optionText", "Option text is required"));
                    } else {
                        String normalized = optText.trim().toLowerCase().replaceAll("\\s+", " ");
                        if (!normalizedTexts.add(normalized)) {
                            errors.add(new ValidationError(optPrefix + "optionText", "Duplicate option text"));
                        }
                    }

                    Integer orderIdx = opt != null ? opt.getOrderIndex() : null;
                    if (orderIdx != null) {
                        if (!orderIndices.add(orderIdx)) {
                            errors.add(new ValidationError(optPrefix + "orderIndex", "Duplicate order index"));
                        }
                    }
                }

                // Correctness checks per type
                if (type.equals("SINGLE_CHOICE")) {
                    long correctCount = opts.stream().filter(o -> o != null && Boolean.TRUE.equals(o.getIsCorrect())).count();
                    if (correctCount != 1) {
                        errors.add(new ValidationError(prefix + "options", "Single choice question must have exactly 1 correct option"));
                    }
                } else if (type.equals("TRUE_FALSE")) {
                    if (opts.size() != 2) {
                        errors.add(new ValidationError(prefix + "options", "True/False question must have exactly 2 options"));
                    }
                    long correctCount = opts.stream().filter(o -> o != null && Boolean.TRUE.equals(o.getIsCorrect())).count();
                    if (correctCount != 1) {
                        errors.add(new ValidationError(prefix + "options", "True/False question must have exactly 1 correct option"));
                    }
                } else if (type.equals("MULTIPLE_CHOICE")) {
                    long correctCount = opts.stream().filter(o -> o != null && Boolean.TRUE.equals(o.getIsCorrect())).count();
                    long incorrectCount = opts.stream().filter(o -> o != null && !Boolean.TRUE.equals(o.getIsCorrect())).count();
                    if (correctCount < 2 || incorrectCount < 1) {
                        errors.add(new ValidationError(prefix + "options", "Multiple choice question must have at least 2 correct options and at least 1 incorrect option"));
                    }
                }
            }
        }

        if (noOptionsType) {
            if (payload.getOptions() != null && !payload.getOptions().isEmpty()) {
                errors.add(new ValidationError(prefix + "options", "Options are not allowed for question type " + type));
            }

            if (type.equals("MATCHING")) {
                validateMatchingAnswerKey(payload.getAnswerKey(), prefix + "answerKey", errors);
            } else if (type.equals("FILL_BLANK")) {
                validateFillBlank(content, payload.getAnswerKey(), prefix, errors);
            } else if (type.equals("ESSAY")) {
                validateEssayRubric(payload.getEssayGradingRubric(), payload.getDefaultPoints(), prefix + "essayGradingRubric", errors);
            }
        }

        return errors;
    }

    private void validateMatchingAnswerKey(Object answerKey, String path, List<ValidationError> errors) {
        if (answerKey == null) {
            errors.add(new ValidationError(path, "Answer key is required for matching questions"));
            return;
        }
        try {
            Map<String, Object> map;
            if (answerKey instanceof Map) {
                map = (Map<String, Object>) answerKey;
            } else {
                map = objectMapper.convertValue(answerKey, Map.class);
            }
            Object pairsObj = map.get("pairs");
            if (!(pairsObj instanceof List)) {
                errors.add(new ValidationError(path, "Answer key must contain 'pairs' list"));
                return;
            }
            List<?> pairs = (List<?>) pairsObj;
            if (pairs.size() < 2) {
                errors.add(new ValidationError(path, "Matching question must have at least 2 pairs"));
                return;
            }
            Set<String> leftSet = new HashSet<>();
            Set<String> rightSet = new HashSet<>();
            for (int i = 0; i < pairs.size(); i++) {
                Object p = pairs.get(i);
                if (!(p instanceof Map)) {
                    errors.add(new ValidationError(path + ".pairs[" + i + "]", "Invalid pair format"));
                    continue;
                }
                Map<?, ?> pairMap = (Map<?, ?>) p;
                String left = sanitize(pairMap.get("left") != null ? pairMap.get("left").toString() : null);
                String right = sanitize(pairMap.get("right") != null ? pairMap.get("right").toString() : null);

                if (left == null || left.trim().isEmpty()) {
                    errors.add(new ValidationError(path + ".pairs[" + i + "].left", "Left side of pair cannot be empty"));
                } else if (!leftSet.add(left.trim().toLowerCase())) {
                    errors.add(new ValidationError(path + ".pairs[" + i + "].left", "Duplicate left side in matching pairs"));
                }

                if (right == null || right.trim().isEmpty()) {
                    errors.add(new ValidationError(path + ".pairs[" + i + "].pairs[" + i + "].right", "Right side of pair cannot be empty"));
                } else if (!rightSet.add(right.trim().toLowerCase())) {
                    errors.add(new ValidationError(path + ".pairs[" + i + "].right", "Duplicate right side in matching pairs"));
                }
            }
        } catch (Exception e) {
            errors.add(new ValidationError(path, "Invalid answer key format for matching question"));
        }
    }

    private void validateFillBlank(String content, Object answerKey, String prefix, List<ValidationError> errors) {
        if (content == null) return;
        Pattern pattern = Pattern.compile("\\{\\{(\\d+)}}");
        Matcher matcher = pattern.matcher(content);
        Set<Integer> contentIndices = new TreeSet<>();
        while (matcher.find()) {
            try {
                contentIndices.add(Integer.parseInt(matcher.group(1)));
            } catch (NumberFormatException ignored) {}
        }

        if (contentIndices.isEmpty()) {
            errors.add(new ValidationError(prefix + "content", "Fill blank question content must contain at least one placeholder like {{1}}"));
        }

        if (answerKey == null) {
            errors.add(new ValidationError(prefix + "answerKey", "Answer key is required for fill-blank questions"));
            return;
        }

        try {
            Map<String, Object> map;
            if (answerKey instanceof Map) {
                map = (Map<String, Object>) answerKey;
            } else {
                map = objectMapper.convertValue(answerKey, Map.class);
            }
            Object blanksObj = map.get("blanks");
            if (!(blanksObj instanceof List)) {
                errors.add(new ValidationError(prefix + "answerKey", "Answer key must contain 'blanks' list"));
                return;
            }
            List<?> blanks = (List<?>) blanksObj;
            Set<Integer> blankIndices = new HashSet<>();

            for (int i = 0; i < blanks.size(); i++) {
                Object b = blanks.get(i);
                if (!(b instanceof Map)) {
                    errors.add(new ValidationError(prefix + "answerKey.blanks[" + i + "]", "Invalid blank format"));
                    continue;
                }
                Map<?, ?> blankMap = (Map<?, ?>) b;
                Object idxObj = blankMap.get("index");
                if (idxObj == null) {
                    errors.add(new ValidationError(prefix + "answerKey.blanks[" + i + "].index", "Blank index is required"));
                    continue;
                }
                int idx;
                try {
                    idx = Integer.parseInt(idxObj.toString());
                } catch (NumberFormatException e) {
                    errors.add(new ValidationError(prefix + "answerKey.blanks[" + i + "].index", "Blank index must be an integer"));
                    continue;
                }

                if (!blankIndices.add(idx)) {
                    errors.add(new ValidationError(prefix + "answerKey.blanks[" + i + "].index", "Duplicate blank index: " + idx));
                }

                Object acceptedObj = blankMap.get("accepted");
                if (!(acceptedObj instanceof List) || ((List<?>) acceptedObj).isEmpty()) {
                    errors.add(new ValidationError(prefix + "answerKey.blanks[" + i + "].accepted", "Blank must have at least one accepted answer"));
                } else {
                    List<?> accepted = (List<?>) acceptedObj;
                    for (int a = 0; a < accepted.size(); a++) {
                        Object accVal = accepted.get(a);
                        if (accVal == null || accVal.toString().trim().isEmpty()) {
                            errors.add(new ValidationError(prefix + "answerKey.blanks[" + i + "].accepted[" + a + "]", "Accepted answer cannot be empty"));
                        }
                    }
                }
            }

            if (!blankIndices.equals(contentIndices)) {
                errors.add(new ValidationError(prefix + "answerKey", "Blanks in answerKey do not match placeholders in content (content: " + contentIndices + ", blanks: " + blankIndices + ")"));
            }
        } catch (Exception e) {
            errors.add(new ValidationError(prefix + "answerKey", "Invalid answer key format for fill-blank question"));
        }
    }

    private void validateEssayRubric(Object rubric, BigDecimal defaultPoints, String path, List<ValidationError> errors) {
        if (rubric == null) {
            // Missing rubric is allowed per spec (warning on publish)
            return;
        }
        try {
            Map<String, Object> map;
            if (rubric instanceof Map) {
                map = (Map<String, Object>) rubric;
            } else {
                map = objectMapper.convertValue(rubric, Map.class);
            }
            Object criteriaObj = map.get("criteria");
            if (!(criteriaObj instanceof List)) {
                errors.add(new ValidationError(path, "Rubric must contain 'criteria' list"));
                return;
            }
            List<?> criteria = (List<?>) criteriaObj;
            BigDecimal totalScore = BigDecimal.ZERO;

            for (int i = 0; i < criteria.size(); i++) {
                Object c = criteria.get(i);
                if (!(c instanceof Map)) {
                    errors.add(new ValidationError(path + ".criteria[" + i + "]", "Invalid criteria format"));
                    continue;
                }
                Map<?, ?> critMap = (Map<?, ?>) c;
                String name = sanitize(critMap.get("name") != null ? critMap.get("name").toString() : null);
                if (name == null || name.trim().isEmpty()) {
                    errors.add(new ValidationError(path + ".criteria[" + i + "].name", "Criteria name is required"));
                }
                Object maxScoreObj = critMap.get("maxScore");
                if (maxScoreObj == null) {
                    errors.add(new ValidationError(path + ".criteria[" + i + "].maxScore", "Criteria maxScore is required"));
                } else {
                    try {
                        BigDecimal maxScore = new BigDecimal(maxScoreObj.toString());
                        if (maxScore.compareTo(BigDecimal.ZERO) <= 0) {
                            errors.add(new ValidationError(path + ".criteria[" + i + "].maxScore", "Criteria maxScore must be greater than 0"));
                        } else {
                            totalScore = totalScore.add(maxScore);
                        }
                    } catch (Exception e) {
                        errors.add(new ValidationError(path + ".criteria[" + i + "].maxScore", "Invalid maxScore format"));
                    }
                }
            }

            BigDecimal expectedPoints = defaultPoints != null ? defaultPoints : BigDecimal.ONE;
            if (totalScore.compareTo(expectedPoints) != 0) {
                errors.add(new ValidationError(path, "Total criteria maxScore (" + totalScore + ") must equal defaultPoints (" + expectedPoints + ")"));
            }
        } catch (Exception e) {
            errors.add(new ValidationError(path, "Invalid rubric format"));
        }
    }
}
