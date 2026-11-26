package com.examprep.util.importer;

import com.examprep.dto.question.ImportBlockResult;
import com.examprep.dto.question.ImportErrorDto;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Component
@RequiredArgsConstructor
public class TemplateQuestionMapper {

    private static final Pattern Q_LINE_PATTERN = Pattern.compile("^Q(\\d+[a-z]?)\\.\\s*(.*)$", Pattern.CASE_INSENSITIVE);
    private static final Pattern OPT_PATTERN = Pattern.compile("^([A-Z])\\.\\s+(.+)$");
    private static final Pattern NUM_OPT_PATTERN = Pattern.compile("^(\\d+)\\.\\s+(.+)$");
    private static final Pattern RUBRIC_ITEM_PATTERN = Pattern.compile("^-\\s*(.+?)\\s*\\|\\s*(\\d+(\\.\\d{1,2})?)\\s*\\|\\s*(.+)$");

    private final ImportedQuestionAssembler assembler;

    public ImportBlockResult mapAndValidateBlock(TemplateBlockParser.RawBlock rawBlock, int blockIndex) {
        return mapAndValidateBlock(rawBlock, blockIndex, null);
    }

    /**
     * Kept overload for backward test/caller compatibility; {@code unusedDefaultDifficulty} is intentionally ignored
     * because DIFFICULTY must be explicitly specified per question in all import templates.
     */
    public ImportBlockResult mapAndValidateBlock(TemplateBlockParser.RawBlock rawBlock, int blockIndex, String unusedDefaultDifficulty) {
        List<ImportErrorDto> preErrors = new ArrayList<>();
        int startLine = rawBlock.getStartLine();
        String qType = rawBlock.getQuestionType() != null ? rawBlock.getQuestionType().trim().toUpperCase(Locale.ROOT) : "";

        if (!ImportedQuestionAssembler.SUPPORTED_TYPES.contains(qType)) {
            return assembler.buildAndValidate(new ImportedQuestionAssembler.Input(
                    blockIndex, startLine, qType, null, "", null, null,
                    List.of(), List.of(), List.of(), List.of(), null, List.of(), preErrors
            ));
        }

        List<String> lines = rawBlock.getBlockLines();
        if (lines == null || lines.isEmpty()) {
            preErrors.add(new ImportErrorDto("content", "Question text (Q1., etc.) is required", startLine));
            return assembler.buildAndValidate(new ImportedQuestionAssembler.Input(
                    blockIndex, startLine, qType, null, "", null, null,
                    List.of(), List.of(), List.of(), List.of(), null, List.of(), preErrors
            ));
        }

        String questionContent = null;
        int qLineIndex = -1;
        for (int i = 0; i < lines.size(); i++) {
            Matcher m = Q_LINE_PATTERN.matcher(lines.get(i));
            if (m.matches()) {
                questionContent = m.group(2).trim();
                qLineIndex = i;
                break;
            }
        }

        if (questionContent == null) {
            preErrors.add(new ImportErrorDto("content", "Question text (Q1., etc.) is required", startLine));
        }

        String difficulty = null;
        String explanation = null;
        String answerRaw = null;
        List<String[]> optionsRaw = new ArrayList<>();
        List<String[]> matchingRightRaw = new ArrayList<>();
        List<String> rubricLines = new ArrayList<>();
        List<String> sampleLines = new ArrayList<>();
        List<String> testCaseJson = new ArrayList<>();
        String codeConfigJson = null;

        boolean parsingContent = qLineIndex >= 0;
        boolean parsingRubric = false;
        boolean parsingSample = false;

        StringBuilder currentContentBuilder = new StringBuilder(questionContent != null ? questionContent : "");

        for (int i = qLineIndex + 1; i < lines.size(); i++) {
            String line = lines.get(i);
            if (line.trim().isEmpty()) continue;

            if (line.startsWith("CODE_CONFIG:")) {
                parsingContent = false;
                parsingRubric = false;
                parsingSample = false;
                codeConfigJson = line.substring("CODE_CONFIG:".length()).trim();
                continue;
            }
            if (line.startsWith("TEST_CASE:")) {
                parsingContent = false;
                parsingRubric = false;
                parsingSample = false;
                testCaseJson.add(line.substring("TEST_CASE:".length()).trim());
                continue;
            }
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
                difficulty = line.substring(11).trim().toUpperCase(Locale.ROOT);
                continue;
            }
            if (line.startsWith("POINTS:")) {
                parsingContent = false;
                parsingRubric = false;
                parsingSample = false;
                preErrors.add(new ImportErrorDto("general", "POINTS line is no longer supported", startLine));
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

            Matcher rubricItemMatcher = RUBRIC_ITEM_PATTERN.matcher(line);
            if (parsingRubric && rubricItemMatcher.matches()) {
                rubricLines.add(line);
                continue;
            }

            boolean acceptsLetterOptions = qType.equals("SINGLE_CHOICE")
                    || qType.equals("MULTIPLE_CHOICE")
                    || qType.equals("ORDERING")
                    || qType.equals("MATCHING");
            Matcher optMatcher = OPT_PATTERN.matcher(line);
            if (acceptsLetterOptions && optMatcher.matches()) {
                parsingContent = false;
                parsingRubric = false;
                parsingSample = false;
                optionsRaw.add(new String[]{optMatcher.group(1), optMatcher.group(2).trim()});
                continue;
            }

            Matcher numOptMatcher = NUM_OPT_PATTERN.matcher(line);
            if (qType.equals("MATCHING") && numOptMatcher.matches()) {
                parsingContent = false;
                parsingRubric = false;
                parsingSample = false;
                matchingRightRaw.add(new String[]{numOptMatcher.group(1), numOptMatcher.group(2).trim()});
                continue;
            }

            if (parsingRubric) {
                rubricLines.add(line);
            } else if (parsingSample) {
                sampleLines.add(line);
            } else if (parsingContent) {
                if (currentContentBuilder.length() > 0) {
                    currentContentBuilder.append(" ");
                }
                currentContentBuilder.append(line);
            } else if (!optionsRaw.isEmpty()) {
                String[] lastOpt = optionsRaw.get(optionsRaw.size() - 1);
                lastOpt[1] = lastOpt[1] + " " + line;
            } else if (questionContent != null) {
                if (currentContentBuilder.length() > 0) {
                    currentContentBuilder.append(" ");
                }
                currentContentBuilder.append(line);
            }
        }

        return assembler.buildAndValidate(new ImportedQuestionAssembler.Input(
                blockIndex,
                startLine,
                qType,
                difficulty,
                currentContentBuilder.toString().trim(),
                explanation,
                answerRaw,
                optionsRaw,
                matchingRightRaw,
                rubricLines,
                sampleLines,
                codeConfigJson,
                testCaseJson,
                preErrors
        ));
    }
}
