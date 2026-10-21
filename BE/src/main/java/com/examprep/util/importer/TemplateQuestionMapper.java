package com.examprep.util.importer;

import com.examprep.dto.question.AnswerOptionDto;
import com.examprep.dto.question.ImportBlockResult;
import com.examprep.dto.question.ImportErrorDto;
import com.examprep.dto.question.QuestionCreateRequest;
import com.examprep.validation.QuestionPayload;
import com.examprep.validation.QuestionValidator;
import com.examprep.validation.ValidationError;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

@Component
@RequiredArgsConstructor
public class TemplateQuestionMapper {

    private final QuestionValidator questionValidator;

    private static final Set<String> SUPPORTED_TYPES = Set.of(
            "SINGLE_CHOICE", "MULTIPLE_CHOICE", "TRUE_FALSE", "MATCHING", "FILL_BLANK", "ESSAY", "ORDERING"
    );

    public ImportBlockResult mapAndValidateBlock(TemplateBlockParser.RawBlock rawBlock, int blockIndex, String defaultDifficulty) {
        List<ImportErrorDto> errors = new ArrayList<>();
        int startLine = rawBlock.getStartLine();
        String qType = rawBlock.getQuestionType();

        if (qType.equals("CODE") || !SUPPORTED_TYPES.contains(qType)) {
            errors.add(new ImportErrorDto("questionType", "Question type not supported yet", startLine));
            return ImportBlockResult.builder()
                    .index(blockIndex)
                    .startLine(startLine)
                    .questionType(qType)
                    .questionData(null)
                    .errors(errors)
                    .build();
        }

        List<String> lines = rawBlock.getBlockLines();
        if (lines.isEmpty()) {
            errors.add(new ImportErrorDto("content", "Question text is required", startLine));
            return ImportBlockResult.builder()
                    .index(blockIndex)
                    .startLine(startLine)
                    .questionType(qType)
                    .questionData(null)
                    .errors(errors)
                    .build();
        }

        // Parse Question (Q<num>. <text>)
        Pattern qPattern = Pattern.compile("^Q(\\d+[a-z]?)\\.\\s*(.*)$", Pattern.CASE_INSENSITIVE);
        String questionContent = null;
        int qLineIndex = -1;

        for (int i = 0; i < lines.size(); i++) {
            Matcher m = qPattern.matcher(lines.get(i));
            if (m.matches()) {
                questionContent = m.group(2).trim();
                qLineIndex = i;
                break;
            }
        }

        if (questionContent == null) {
            errors.add(new ImportErrorDto("content", "Question text (Q1., etc.) is required", startLine));
            return ImportBlockResult.builder()
                    .index(blockIndex)
                    .startLine(startLine)
                    .questionType(qType)
                    .questionData(null)
                    .errors(errors)
                    .build();
        }

        // Collect other fields: options, answer, difficulty, points, explanation, rubric, sample
        String difficulty = defaultDifficulty;
        BigDecimal points = BigDecimal.ONE;
        String explanation = null;
        String answerRaw = null;
        List<String[]> optionsRaw = new ArrayList<>(); // label/key -> text
        List<String[]> matchingRightRaw = new ArrayList<>(); // num -> text
        List<String> rubricLines = new ArrayList<>();
        List<String> sampleLines = new ArrayList<>();

        boolean parsingContent = true;
        boolean parsingRubric = false;
        boolean parsingSample = false;

        StringBuilder currentContentBuilder = new StringBuilder(questionContent);

        for (int i = qLineIndex + 1; i < lines.size(); i++) {
            String line = lines.get(i);
            if (line.trim().isEmpty()) continue;

            if (line.startsWith("ANSWER:")) {
                parsingContent = false;
                parsingRubric = false;
                parsingSample = false;
                answerRaw = line.substring(7).trim();
                continue;
            }
            if (line.startsWith("DIFFICULTY:")) {
                parsingContent = false;
                parsingRubric = false;
                parsingSample = false;
                difficulty = line.substring(11).trim().toUpperCase();
                continue;
            }
            if (line.startsWith("POINTS:")) {
                parsingContent = false;
                parsingRubric = false;
                parsingSample = false;
                try {
                    points = new BigDecimal(line.substring(7).trim());
                } catch (Exception e) {
                    errors.add(new ImportErrorDto("defaultPoints", "Invalid points format", startLine));
                }
                continue;
            }
            if (line.startsWith("EXPLANATION:")) {
                parsingContent = false;
                parsingRubric = false;
                parsingSample = false;
                explanation = line.substring(12).trim();
                continue;
            }
            if (line.equals("RUBRIC:")) {
                parsingContent = false;
                parsingRubric = true;
                parsingSample = false;
                continue;
            }
            if (line.equals("SAMPLE:")) {
                parsingContent = false;
                parsingRubric = false;
                parsingSample = true;
                continue;
            }

            Matcher optMatcher = Pattern.compile("^([A-Z])\\.\\s+(.+)$").matcher(line);
            Matcher numOptMatcher = Pattern.compile("^(\\d+)\\.\\s+(.+)$").matcher(line);
            Matcher rubricItemMatcher = Pattern.compile("^-\\s*(.+?)\\s*\\|\\s*(\\d+(\\.\\d{1,2})?)\\s*\\|\\s*(.+)$").matcher(line);

            if (parsingRubric && rubricItemMatcher.matches()) {
                rubricLines.add(line);
                continue;
            }

            if (optMatcher.matches()) {
                parsingContent = false;
                parsingRubric = false;
                parsingSample = false;
                optionsRaw.add(new String[]{optMatcher.group(1), optMatcher.group(2).trim()});
                continue;
            }

            if (qType.equals("MATCHING") && numOptMatcher.matches()) {
                parsingContent = false;
                parsingRubric = false;
                parsingSample = false;
                matchingRightRaw.add(new String[]{numOptMatcher.group(1), numOptMatcher.group(2).trim()});
                continue;
            }

            // Line continuation / wrapping
            if (parsingRubric) {
                rubricLines.add(line);
            } else if (parsingSample) {
                sampleLines.add(line);
            } else if (parsingContent) {
                currentContentBuilder.append(" ").append(line);
            } else if (!optionsRaw.isEmpty()) {
                // Append to last option text
                String[] lastOpt = optionsRaw.get(optionsRaw.size() - 1);
                lastOpt[1] = lastOpt[1] + " " + line;
            } else {
                currentContentBuilder.append(" ").append(line);
            }
        }

        String finalContent = currentContentBuilder.toString().trim();

        // Build Request payload
        QuestionCreateRequest req = new QuestionCreateRequest();
        req.setQuestionType(qType);
        req.setDifficulty(difficulty != null ? difficulty : "MEDIUM");
        req.setStatus("ACTIVE");
        req.setContent(finalContent);
        req.setDefaultPoints(points);
        req.setExplanation(explanation);

        try {
            switch (qType) {
                case "SINGLE_CHOICE":
case "MULTIPLE_CHOICE":
                    if (answerRaw == null || answerRaw.isEmpty()) {
                        errors.add(new ImportErrorDto("answerKey", "ANSWER is required", startLine));
                        break;
                    }
                    List<AnswerOptionDto> scOpts = new ArrayList<>();
                    Set<String> correctLetters = Arrays.stream(answerRaw.split(","))
                            .map(String::trim)
                            .collect(Collectors.toSet());

                    for (int o = 0; o < optionsRaw.size(); o++) {
                        String letter = optionsRaw.get(o)[0];
                        String optText = optionsRaw.get(o)[1];
                        boolean isCorrect = correctLetters.contains(letter);
                        scOpts.add(AnswerOptionDto.builder()
                                .optionText(optText)
                                .isCorrect(isCorrect)
                                .orderIndex(o)
                                .build());
                    }
                    req.setOptions(scOpts);
                    break;

                case "TRUE_FALSE":
                    if (answerRaw == null || answerRaw.isEmpty()) {
                        errors.add(new ImportErrorDto("answerKey", "ANSWER is required", startLine));
                        break;
                    }
                    boolean tfAns = Boolean.parseBoolean(answerRaw);
                    req.setOptions(List.of(
                            AnswerOptionDto.builder().optionText("True").isCorrect(tfAns).orderIndex(0).build(),
                            AnswerOptionDto.builder().optionText("False").isCorrect(!tfAns).orderIndex(1).build()
                    ));
                    break;

                case "FILL_BLANK":
                    if (answerRaw == null || answerRaw.isEmpty()) {
                        errors.add(new ImportErrorDto("answerKey", "ANSWER is required", startLine));
                        break;
                    }
                    // Count blanks in content (____)
                    int blankCount = 0;
                    Matcher blankMatcher = Pattern.compile("____").matcher(finalContent);
                    StringBuffer sb = new StringBuffer();
                    while (blankMatcher.find()) {
                        blankCount++;
                        blankMatcher.appendReplacement(sb, "{{" + blankCount + "}}");
                    }
                    blankMatcher.appendTail(sb);
                    req.setContent(sb.toString());

                    List<Map<String, Object>> blanksList = new ArrayList<>();
                    if (blankCount == 1 && !answerRaw.contains("=")) {
                        List<String> accepted = Arrays.stream(answerRaw.split("\\|"))
                                .map(String::trim)
                                .collect(Collectors.toList());
                        blanksList.add(Map.of("index", 1, "accepted", accepted, "caseSensitive", false));
                    } else {
                        // format: 1=Tokyo; 2=Japan or similar
                        String[] parts = answerRaw.split(";");
                        for (String part : parts) {
                            String[] kv = part.split("=", 2);
                            if (kv.length == 2) {
                                int idx = Integer.parseInt(kv[0].trim());
                                List<String> accepted = Arrays.stream(kv[1].trim().split("\\|"))
                                        .map(String::trim)
                                        .collect(Collectors.toList());
                                blanksList.add(Map.of("index", idx, "accepted", accepted, "caseSensitive", false));
                            }
                        }
                    }
                    req.setAnswerKey(Map.of("blanks", blanksList));
                    break;

                case "ORDERING":
                    if (answerRaw == null || answerRaw.isEmpty()) {
                        errors.add(new ImportErrorDto("answerKey", "ANSWER is required", startLine));
                        break;
                    }
                    List<String> correctOrder = Arrays.stream(answerRaw.split(","))
                            .map(String::trim)
                            .collect(Collectors.toList());

                    List<AnswerOptionDto> ordOpts = new ArrayList<>();
                    for (int o = 0; o < optionsRaw.size(); o++) {
                        String letter = optionsRaw.get(o)[0];
                        String optText = optionsRaw.get(o)[1];
                        ordOpts.add(AnswerOptionDto.builder()
                                .key(letter)
                                .optionText(optText)
                                .orderIndex(o)
                                .build());
                    }
                    req.setOptions(ordOpts);
                    req.setCorrectOrder(correctOrder.stream().map(s -> (Object) s).collect(Collectors.toList()));
                    break;

                case "MATCHING":
                    if (answerRaw == null || answerRaw.isEmpty()) {
                        errors.add(new ImportErrorDto("answerKey", "ANSWER is required", startLine));
                        break;
                    }
                    Map<String, String> leftMap = optionsRaw.stream().collect(Collectors.toMap(o -> o[0], o -> o[1]));
                    Map<String, String> rightMap = matchingRightRaw.stream().collect(Collectors.toMap(o -> o[0], o -> o[1]));

                    List<Map<String, String>> pairs = new ArrayList<>();
                    String[] pairParts = answerRaw.split(",");
                    for (String pp : pairParts) {
                        String[] lr = pp.trim().split("-");
                        if (lr.length == 2) {
                            String lKey = lr[0].trim();
                            String rKey = lr[1].trim();
                            String lText = leftMap.get(lKey);
                            String rText = rightMap.get(rKey);
                            if (lText != null && rText != null) {
                                pairs.add(Map.of("left", lText, "right", rText));
                            }
                        }
                    }
                    req.setAnswerKey(Map.of("pairs", pairs));
                    break;

                case "ESSAY":
                    List<Map<String, Object>> criteriaList = new ArrayList<>();
                    BigDecimal totalRubricScore = BigDecimal.ZERO;
                    for (String rLine : rubricLines) {
                        Matcher rm = Pattern.compile("^-\\s*(.+?)\\s*\\|\\s*(\\d+(\\.\\d{1,2})?)\\s*\\|\\s*(.+)$").matcher(rLine);
                        if (rm.matches()) {
                            String name = rm.group(1).trim();
                            BigDecimal score = new BigDecimal(rm.group(2).trim());
                            String desc = rm.group(4).trim();
                            totalRubricScore = totalRubricScore.add(score);
                            criteriaList.add(Map.of("name", name, "maxScore", score, "description", desc));
                        }
                    }
                    req.setEssayGradingRubric(Map.of("criteria", criteriaList));
                    if (!sampleLines.isEmpty()) {
                        String sampleText = String.join("\n", sampleLines).trim();
                        // Put sample in explanation or metadata if needed, or if supported
                        if (req.getExplanation() == null) {
                            req.setExplanation(sampleText);
                        }
                    }
                    break;
            }

            // Validate using existing QuestionValidator
            QuestionPayload payload = QuestionPayload.from(req);
            List<ValidationError> valErrors = questionValidator.validate(payload);
            for (ValidationError ve : valErrors) {
                errors.add(new ImportErrorDto(ve.getPath(), ve.getMessage(), startLine));
            }

        } catch (Exception e) {
            errors.add(new ImportErrorDto("general", "Mapping error: " + e.getMessage(), startLine));
        }

        return ImportBlockResult.builder()
                .index(blockIndex)
                .startLine(startLine)
                .questionType(qType)
                .questionData(errors.isEmpty() ? req : null)
                .errors(errors)
                .build();
    }
}
