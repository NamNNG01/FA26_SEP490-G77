package com.examprep.util.importer;

import com.examprep.dto.question.AnswerOptionDto;
import com.examprep.dto.question.CodeConfigDto;
import com.examprep.dto.question.ImportBlockResult;
import com.examprep.dto.question.ImportErrorDto;
import com.examprep.dto.question.QuestionCreateRequest;
import com.examprep.dto.question.TestCaseDto;
import com.examprep.util.validation.QuestionPayload;
import com.examprep.util.validation.QuestionValidator;
import com.examprep.util.validation.ValidationError;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

@Component
@RequiredArgsConstructor
public class ImportedQuestionAssembler {

    public static final Set<String> SUPPORTED_TYPES = Set.of(
            "SINGLE_CHOICE", "MULTIPLE_CHOICE", "TRUE_FALSE", "MATCHING", "FILL_BLANK",
            "ESSAY", "ORDERING", "CODE", "DIAGRAM", "DIAGRAM_ESSAY"
    );

    private static final Pattern BLANK_UNDERSCORES = Pattern.compile("____");
    private static final Pattern BLANK_PLACEHOLDER = Pattern.compile("\\{\\{(\\d+)\\}\\}");
    private static final Pattern FILL_BLANK_ENTRY = Pattern.compile("^\\s*(?:Blank\\s*)?(\\d+)\\s*[=:]\\s*(.+)$", Pattern.CASE_INSENSITIVE);
    private static final Pattern RUBRIC_LINE = Pattern.compile("^-\\s*(.+?)\\s*\\|\\s*(\\d+(\\.\\d{1,2})?)\\s*\\|\\s*(.+)$");

    private final QuestionValidator questionValidator;
    private final ObjectMapper objectMapper;

    public record Input(
            int index,
            int location,
            String questionType,
            String difficulty,
            String content,
            String explanation,
            String answerRaw,
            List<String[]> optionsRaw,
            List<String[]> matchingRightRaw,
            List<String> rubricLines,
            List<String> sampleLines,
            String codeConfigJson,
            List<String> testCaseJsonLines,
            String diagramXml,
            List<ImportErrorDto> preErrors
    ) {}

    public ImportBlockResult buildAndValidate(Input in) {
        List<ImportErrorDto> errors = new ArrayList<>();
        if (in.preErrors() != null) {
            errors.addAll(in.preErrors());
        }

        int loc = in.location();
        String qType = in.questionType() != null ? in.questionType().trim().toUpperCase(Locale.ROOT) : "";

        if (qType.isEmpty() || !SUPPORTED_TYPES.contains(qType)) {
            errors.add(new ImportErrorDto("questionType",
                    qType.isEmpty() ? "Question type is required" : "Question type not supported yet: " + qType,
                    loc));
            return ImportBlockResult.builder()
                    .index(in.index())
                    .startLine(loc)
                    .questionType(qType.isEmpty() ? null : qType)
                    .questionData(null)
                    .errors(deduplicateErrors(errors))
                    .build();
        }

        String rawDifficulty = in.difficulty() != null ? in.difficulty().trim().toUpperCase(Locale.ROOT) : "";
        String normalizedDifficulty = rawDifficulty.isEmpty() ? null : rawDifficulty;
        if (normalizedDifficulty == null) {
            errors.add(new ImportErrorDto("difficulty", "DIFFICULTY is required (EASY, MEDIUM, or HARD)", loc));
        }

        String finalContent = in.content() != null ? in.content().trim() : "";
        String explanation = in.explanation() != null && !in.explanation().trim().isEmpty()
                ? in.explanation().trim()
                : null;
        if (explanation != null && explanation.length() > 255) {
            errors.add(new ImportErrorDto("explanation", "EXPLANATION must be 255 characters or fewer", loc));
        }
        String answerRaw = in.answerRaw() != null ? in.answerRaw().trim() : "";

        QuestionCreateRequest req = new QuestionCreateRequest();
        req.setQuestionType(qType);
        req.setDifficulty(normalizedDifficulty);
        req.setStatus("ACTIVE");
        req.setContent(finalContent);
        req.setExplanation(explanation);

        List<String[]> optionsRaw = in.optionsRaw() != null ? in.optionsRaw() : List.of();
        List<String[]> matchingRightRaw = in.matchingRightRaw() != null ? in.matchingRightRaw() : List.of();

        switch (qType) {
            case "SINGLE_CHOICE", "MULTIPLE_CHOICE" -> mapChoice(qType, optionsRaw, answerRaw, loc, req, errors);
            case "TRUE_FALSE" -> mapTrueFalse(answerRaw, loc, req, errors);
            case "FILL_BLANK" -> mapFillBlank(finalContent, answerRaw, loc, req, errors);
            case "ORDERING" -> mapOrdering(optionsRaw, answerRaw, loc, req, errors);
            case "MATCHING" -> mapMatching(optionsRaw, matchingRightRaw, answerRaw, loc, req, errors);
            case "ESSAY", "DIAGRAM", "DIAGRAM_ESSAY" -> mapEssayAndDiagram(
                    qType, in.rubricLines(), in.sampleLines(), in.diagramXml(), loc, req, errors);
            case "CODE" -> mapCode(in.codeConfigJson(), in.testCaseJsonLines(), loc, req, errors);
        }

        QuestionPayload payload = QuestionPayload.from(req);
        List<ValidationError> valErrors = questionValidator.validate(payload);
        for (ValidationError ve : valErrors) {
            errors.add(new ImportErrorDto(ve.getPath(), ve.getMessage(), loc));
        }

        return ImportBlockResult.builder()
                .index(in.index())
                .startLine(loc)
                .questionType(qType)
                .questionData(req)
                .errors(deduplicateErrors(errors))
                .build();
    }

    private void mapChoice(
            String qType,
            List<String[]> optionsRaw,
            String answerRaw,
            int loc,
            QuestionCreateRequest req,
            List<ImportErrorDto> errors
    ) {
        Set<String> availableLetters = new LinkedHashSet<>();
        for (String[] opt : optionsRaw) {
            String letter = opt[0].trim().toUpperCase(Locale.ROOT);
            if (!availableLetters.add(letter)) {
                errors.add(new ImportErrorDto("options", "Duplicate option label '" + letter + "'", loc));
            }
        }

        Set<String> correctLetters = new LinkedHashSet<>();
        if (answerRaw.isEmpty()) {
            errors.add(new ImportErrorDto("answerKey", "ANSWER is required", loc));
        } else {
            String[] parts = answerRaw.split(",");
            for (String p : parts) {
                String letter = p.trim().toUpperCase(Locale.ROOT);
                if (letter.isEmpty()) {
                    errors.add(new ImportErrorDto("answerKey", "ANSWER contains an empty option label", loc));
                    continue;
                }
                if (!availableLetters.isEmpty() && !availableLetters.contains(letter)) {
                    errors.add(new ImportErrorDto("answerKey", "ANSWER references unknown option '" + letter + "'", loc));
                    continue;
                }
                correctLetters.add(letter);
            }
            if ("SINGLE_CHOICE".equals(qType) && correctLetters.size() > 1) {
                errors.add(new ImportErrorDto("answerKey", "SINGLE_CHOICE question must have exactly 1 answer letter", loc));
            }
        }

        List<AnswerOptionDto> opts = new ArrayList<>();
        for (int i = 0; i < optionsRaw.size(); i++) {
            String letter = optionsRaw.get(i)[0].trim().toUpperCase(Locale.ROOT);
            String optText = optionsRaw.get(i)[1] != null ? optionsRaw.get(i)[1].trim() : "";
            opts.add(AnswerOptionDto.builder()
                    .optionText(optText)
                    .isCorrect(correctLetters.contains(letter))
                    .orderIndex(i)
                    .build());
        }
        req.setOptions(opts);
    }

    private void mapTrueFalse(
            String answerRaw,
            int loc,
            QuestionCreateRequest req,
            List<ImportErrorDto> errors
    ) {
        Boolean tfAns = null;
        if (answerRaw.isEmpty()) {
            errors.add(new ImportErrorDto("answerKey", "ANSWER is required", loc));
        } else {
            String normalized = answerRaw.toLowerCase(Locale.ROOT);
            if ("true".equals(normalized) || "t".equals(normalized)) {
                tfAns = true;
            } else if ("false".equals(normalized) || "f".equals(normalized)) {
                tfAns = false;
            } else {
                errors.add(new ImportErrorDto("answerKey", "TRUE_FALSE answer must be True or False", loc));
            }
        }
        req.setOptions(List.of(
                AnswerOptionDto.builder().optionText("True").isCorrect(Boolean.TRUE.equals(tfAns)).orderIndex(0).build(),
                AnswerOptionDto.builder().optionText("False").isCorrect(Boolean.FALSE.equals(tfAns)).orderIndex(1).build()
        ));
    }

    private void mapFillBlank(
            String finalContent,
            String answerRaw,
            int loc,
            QuestionCreateRequest req,
            List<ImportErrorDto> errors
    ) {
        int maxExistingIndex = 0;
        Matcher existingPlaceholder = BLANK_PLACEHOLDER.matcher(finalContent);
        while (existingPlaceholder.find()) {
            try {
                maxExistingIndex = Math.max(maxExistingIndex, Integer.parseInt(existingPlaceholder.group(1)));
            } catch (NumberFormatException ignored) {}
        }

        int blankIndexCounter = maxExistingIndex;
        Matcher blankMatcher = BLANK_UNDERSCORES.matcher(finalContent);
        StringBuffer sb = new StringBuffer();
        while (blankMatcher.find()) {
            blankIndexCounter++;
            blankMatcher.appendReplacement(sb, "{{" + blankIndexCounter + "}}");
        }
        blankMatcher.appendTail(sb);
        String normalizedContent = sb.toString();
        req.setContent(normalizedContent);

        int totalContentBlanks = countDistinctPlaceholders(normalizedContent);

        if (answerRaw.isEmpty()) {
            errors.add(new ImportErrorDto("answerKey", "ANSWER is required", loc));
            req.setAnswerKey(Map.of("blanks", List.of()));
            return;
        }

        List<Map<String, Object>> blanksList = new ArrayList<>();
        if (totalContentBlanks <= 1 && !FILL_BLANK_ENTRY.matcher(answerRaw).matches()) {
            List<String> accepted = parseAcceptedBlankValues(answerRaw, loc, errors);
            blanksList.add(Map.of("index", 1, "accepted", accepted, "caseSensitive", false));
        } else {
            String[] parts = answerRaw.split(";");
            for (String part : parts) {
                if (part.isBlank()) continue;
                Matcher bm = FILL_BLANK_ENTRY.matcher(part);
                if (bm.matches()) {
                    int idx = Integer.parseInt(bm.group(1));
                    List<String> accepted = parseAcceptedBlankValues(bm.group(2), loc, errors);
                    blanksList.add(Map.of("index", idx, "accepted", accepted, "caseSensitive", false));
                } else {
                    errors.add(new ImportErrorDto("answerKey", "Invalid FILL_BLANK answer entry: " + part.trim(), loc));
                }
            }
        }
        req.setAnswerKey(Map.of("blanks", blanksList));
    }

    private int countDistinctPlaceholders(String content) {
        Set<Integer> indices = new TreeSet<>();
        Matcher m = BLANK_PLACEHOLDER.matcher(content);
        while (m.find()) {
            try {
                indices.add(Integer.parseInt(m.group(1)));
            } catch (NumberFormatException ignored) {}
        }
        return indices.size();
    }

    private List<String> parseAcceptedBlankValues(String raw, int loc, List<ImportErrorDto> errors) {
        String[] segments = raw.split("\\|", -1);
        List<String> accepted = new ArrayList<>();
        for (String seg : segments) {
            String trimmed = seg.trim();
            if (trimmed.isEmpty()) {
                errors.add(new ImportErrorDto("answerKey", "Blank contains an empty accepted answer near '" + raw.trim() + "'", loc));
            } else {
                accepted.add(trimmed);
            }
        }
        return accepted;
    }

    private void mapOrdering(
            List<String[]> optionsRaw,
            String answerRaw,
            int loc,
            QuestionCreateRequest req,
            List<ImportErrorDto> errors
    ) {
        List<AnswerOptionDto> ordOpts = new ArrayList<>();
        for (int o = 0; o < optionsRaw.size(); o++) {
            String letter = optionsRaw.get(o)[0].trim().toUpperCase(Locale.ROOT);
            String optText = optionsRaw.get(o)[1] != null ? optionsRaw.get(o)[1].trim() : "";
            ordOpts.add(AnswerOptionDto.builder()
                    .key(letter)
                    .optionText(optText)
                    .orderIndex(o)
                    .build());
        }
        req.setOptions(ordOpts);

        if (answerRaw.isEmpty()) {
            errors.add(new ImportErrorDto("answerKey", "ANSWER is required", loc));
            return;
        }
        List<String> correctOrder = Arrays.stream(answerRaw.split(","))
                .map(s -> s.trim().toUpperCase(Locale.ROOT))
                .filter(s -> !s.isEmpty())
                .collect(Collectors.toList());
        req.setCorrectOrder(correctOrder.stream().map(s -> (Object) s).collect(Collectors.toList()));
    }

    private void mapMatching(
            List<String[]> optionsRaw,
            List<String[]> matchingRightRaw,
            String answerRaw,
            int loc,
            QuestionCreateRequest req,
            List<ImportErrorDto> errors
    ) {
        Map<String, String> leftMap = new LinkedHashMap<>();
        for (String[] o : optionsRaw) {
            String key = o[0].trim().toUpperCase(Locale.ROOT);
            if (leftMap.putIfAbsent(key, o[1] != null ? o[1].trim() : "") != null) {
                errors.add(new ImportErrorDto("options", "Duplicate left option '" + key + "'", loc));
            }
        }

        Map<String, String> rightMap = new LinkedHashMap<>();
        for (String[] o : matchingRightRaw) {
            String key = o[0].trim().toUpperCase(Locale.ROOT);
            if (rightMap.putIfAbsent(key, o[1] != null ? o[1].trim() : "") != null) {
                errors.add(new ImportErrorDto("answerKey", "Duplicate right option '" + key + "'", loc));
            }
        }

        if (leftMap.isEmpty()) {
            errors.add(new ImportErrorDto("answerKey", "Matching left items (A., B., ...) are required", loc));
        }
        if (rightMap.isEmpty()) {
            errors.add(new ImportErrorDto("answerKey", "Matching right items (1., 2., ...) are required", loc));
        }

        List<Map<String, String>> pairs = new ArrayList<>();
        Set<String> usedLeft = new LinkedHashSet<>();
        Set<String> usedRight = new LinkedHashSet<>();

        if (answerRaw.isEmpty()) {
            errors.add(new ImportErrorDto("answerKey", "ANSWER is required (e.g. A-1, B-2)", loc));
        } else {
            String[] pairParts = answerRaw.split(",");
            for (String pp : pairParts) {
                String trimmedPair = pp.trim();
                if (trimmedPair.isEmpty()) {
                    errors.add(new ImportErrorDto("answerKey", "Empty matching pair in ANSWER", loc));
                    continue;
                }
                String[] lr = trimmedPair.split("-", -1);
                if (lr.length != 2) {
                    errors.add(new ImportErrorDto("answerKey", "Invalid MATCHING pair '" + trimmedPair + "' (expected format: A-1)", loc));
                    continue;
                }
                String lKey = lr[0].trim().toUpperCase(Locale.ROOT);
                String rKey = lr[1].trim().toUpperCase(Locale.ROOT);
                String lText = leftMap.get(lKey);
                String rText = rightMap.get(rKey);
                if (lText == null || lText.isEmpty()) {
                    errors.add(new ImportErrorDto("answerKey", "Unknown left item '" + lKey + "' in pair '" + trimmedPair + "'", loc));
                    continue;
                }
                if (rText == null || rText.isEmpty()) {
                    errors.add(new ImportErrorDto("answerKey", "Unknown right item '" + rKey + "' in pair '" + trimmedPair + "'", loc));
                    continue;
                }
                usedLeft.add(lKey);
                usedRight.add(rKey);
                pairs.add(Map.of("left", lText, "right", rText));
            }
            if (!leftMap.isEmpty() && usedLeft.size() < leftMap.size()) {
                errors.add(new ImportErrorDto("answerKey", "Some matching left items are not paired in ANSWER", loc));
            }
            if (!rightMap.isEmpty() && usedRight.size() < rightMap.size()) {
                errors.add(new ImportErrorDto("answerKey", "Some matching right items are not paired in ANSWER", loc));
            }
        }
        req.setAnswerKey(Map.of("pairs", pairs));
    }

    private void mapEssayAndDiagram(
            String qType,
            List<String> rubricLines,
            List<String> sampleLines,
            String diagramXml,
            int loc,
            QuestionCreateRequest req,
            List<ImportErrorDto> errors
    ) {
        List<Map<String, Object>> criteriaList = new ArrayList<>();
        if (rubricLines != null) {
            for (String rawLine : rubricLines) {
                String rLine = rawLine != null ? rawLine.trim() : "";
                if (rLine.isEmpty()) continue;
                Matcher rm = RUBRIC_LINE.matcher(rLine);
                if (rm.matches()) {
                    String name = rm.group(1).trim();
                    BigDecimal score = new BigDecimal(rm.group(2).trim());
                    String desc = rm.group(4).trim();
                    criteriaList.add(Map.of("name", name, "weight", score, "description", desc));
                } else {
                    errors.add(new ImportErrorDto("essayGradingRubric",
                            "Invalid RUBRIC line format (expected '- Criteria | weight | description'): " + rLine,
                            loc));
                }
            }
        }
        req.setEssayGradingRubric(Map.of("criteria", criteriaList));

        if (sampleLines != null && !sampleLines.isEmpty()) {
            String sampleText = String.join("\n", sampleLines).trim();
            if (!sampleText.isEmpty() && req.getExplanation() == null) {
                if (sampleText.length() > 255) {
                    errors.add(new ImportErrorDto("explanation", "SAMPLE/EXPLANATION must be 255 characters or fewer", loc));
                }
                req.setExplanation(sampleText);
            }
        }

        if ("DIAGRAM".equals(qType) || "DIAGRAM_ESSAY".equals(qType)) {
            String xml = diagramXml != null ? diagramXml.trim() : "";
            req.setQuestionMetadata(Map.of("drawioXml", xml));
        }
    }

    private void mapCode(
            String codeConfigJson,
            List<String> testCaseJsonLines,
            int loc,
            QuestionCreateRequest req,
            List<ImportErrorDto> errors
    ) {
        if (codeConfigJson != null && !codeConfigJson.isBlank()) {
            try {
                req.setCodeConfig(objectMapper.readValue(codeConfigJson, CodeConfigDto.class));
            } catch (Exception e) {
                errors.add(new ImportErrorDto("codeConfig", "Invalid CODE_CONFIG JSON: " + e.getMessage(), loc));
            }
        }
        List<TestCaseDto> testCases = new ArrayList<>();
        if (testCaseJsonLines != null) {
            for (String tcRaw : testCaseJsonLines) {
                if (tcRaw == null || tcRaw.isBlank()) continue;
                String trimmed = tcRaw.trim();
                try {
                    if (trimmed.startsWith("[")) {
                        TestCaseDto[] arr = objectMapper.readValue(trimmed, TestCaseDto[].class);
                        testCases.addAll(Arrays.asList(arr));
                    } else {
                        testCases.add(objectMapper.readValue(trimmed, TestCaseDto.class));
                    }
                } catch (Exception e) {
                    errors.add(new ImportErrorDto("testCases", "Invalid TEST_CASE JSON: " + e.getMessage(), loc));
                }
            }
        }
        req.setTestCases(testCases);
    }

    private List<ImportErrorDto> deduplicateErrors(List<ImportErrorDto> raw) {
        Map<String, ImportErrorDto> unique = new LinkedHashMap<>();
        for (ImportErrorDto err : raw) {
            String key = (err.getPath() != null ? err.getPath() : "") + "::" + (err.getMessage() != null ? err.getMessage() : "");
            unique.putIfAbsent(key, err);
        }
        return new ArrayList<>(unique.values());
    }
}
