package com.examprep.services.manager.review;

import com.examprep.dto.question.CodeConfigDto;
import com.examprep.dto.question.TestCaseDto;
import com.examprep.entities.*;
import com.examprep.repositories.*;
import com.examprep.util.validation.QuestionPayload;
import com.examprep.util.validation.QuestionValidator;
import com.examprep.util.ContentHashUtil;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class QuestionPromotionService {

    private final QuestionRepository questionRepository;
    private final AnswerOptionRepository answerOptionRepository;
    private final CodeQuestionConfigRepository codeQuestionConfigRepository;
    private final CodeTestCaseRepository codeTestCaseRepository;
    private final QuestionValidator questionValidator;
    private final ObjectMapper objectMapper;

    @Transactional(propagation = Propagation.MANDATORY)
    public Question promoteContribution(QuestionContribution c, Course course, com.examprep.entities.Module module, QuestionGroup group, User reviewer) {
        if (c.getContent() == null || c.getContent().isBlank()) {
            throw new IllegalArgumentException("Question content cannot be blank");
        }

        String questionType = c.getQuestionType() != null ? c.getQuestionType() : "SINGLE_CHOICE";
        CodeConfigDto codeConfig = readJson(c.getCodeConfigJson(), new TypeReference<CodeConfigDto>() {});
        List<TestCaseDto> testCases = readJson(c.getTestCasesJson(), new TypeReference<List<TestCaseDto>>() {});
        List<Map<String, Object>> rawOptions = null;
        if (c.getOptionsJson() != null && !c.getOptionsJson().isBlank()) {
            try {
                rawOptions = objectMapper.readValue(c.getOptionsJson(), new TypeReference<>() {});
            } catch (Exception ignored) {}
        }

        List<com.examprep.dto.question.AnswerOptionDto> options = toOptionDtos(rawOptions);
        QuestionPayload payload = QuestionPayload.builder()
                .questionType(questionType)
                .difficulty(c.getDifficulty() != null ? c.getDifficulty() : "MEDIUM")
                .content(c.getContent())
                .questionMetadata(readJson(c.getQuestionMetadataJson(), new TypeReference<Object>() {}))
                .answerKey(readJson(c.getAnswerKeyJson(), new TypeReference<Object>() {}))
                .essayGradingRubric(readJson(c.getEssayGradingRubricJson(), new TypeReference<Object>() {}))
                .options(options)
                .correctOrder(readJson(c.getCategoryIds(), new TypeReference<List<Object>>() {}))
                .codeConfig(codeConfig)
                .testCases(testCases)
                .build();
        questionValidator.validateOrThrow(payload);

        List<String> optionTexts = rawOptions != null ? rawOptions.stream().map(o -> (String) o.get("optionText")).toList() : null;
        String contentHash = ContentHashUtil.computeHash(c.getContent(), optionTexts);

        String rubricJson = c.getEssayGradingRubricJson();
        String metadataJson = c.getQuestionMetadataJson();
        String answerKeyJson = c.getAnswerKeyJson();

        Question question = Question.builder()
                .course(course)
                .module(module)
                .group(group)
                .createdBy(User.builder().userId(c.getUserId()).build())
                .questionType(questionType)
                .difficulty(c.getDifficulty() != null ? c.getDifficulty() : "MEDIUM")
                .content(c.getContent())
                .questionMetadata(metadataJson)
                .answerKey(answerKeyJson)
                .source("STUDENT_CONTRIBUTION")
                .creatorRole("STUDENT")
                .approvalStatus("ACCEPTED")
                .status("ACTIVE")
                .aiExplanation(c.getExplanation())
                .essayGradingRubric(rubricJson)
                .contentHash(contentHash)
                .scoringVersion(1)
                .lockVersion(0L)
                .build();

        Question savedQuestion = questionRepository.save(question);

        if (rawOptions != null) {
            for (int i = 0; i < rawOptions.size(); i++) {
                Map<String, Object> optMap = rawOptions.get(i);
                String optText = (String) optMap.get("optionText");
                Boolean isCorrect = optMap.get("isCorrect") instanceof Boolean b ? b : false;
                String optExpl = (String) optMap.get("explanation");
                Integer orderIdx = optMap.get("orderIndex") instanceof Number n ? n.intValue() : i;

                AnswerOption option = AnswerOption.builder()
                        .question(savedQuestion)
                        .optionText(optText)
                        .isCorrect(isCorrect)
                        .explanation(optExpl)
                        .orderIndex(orderIdx)
                        .build();
                answerOptionRepository.save(option);
            }
        }

        if ("CODE".equals(questionType)) {
            saveCodeConfiguration(savedQuestion, codeConfig);
            saveTestCases(savedQuestion, testCases);
        }

        return savedQuestion;
    }

    private List<com.examprep.dto.question.AnswerOptionDto> toOptionDtos(List<Map<String, Object>> rawOptions) {
        if (rawOptions == null) return null;
        List<com.examprep.dto.question.AnswerOptionDto> options = new java.util.ArrayList<>();
        for (int i = 0; i < rawOptions.size(); i++) {
            Map<String, Object> raw = rawOptions.get(i);
            options.add(com.examprep.dto.question.AnswerOptionDto.builder()
                    .optionText((String) raw.get("optionText"))
                    .isCorrect(raw.get("isCorrect") instanceof Boolean value ? value : null)
                    .explanation((String) raw.get("explanation"))
                    .orderIndex(raw.get("orderIndex") instanceof Number value ? value.intValue() : i)
                    .key((String) raw.get("key"))
                    .build());
        }
        return options;
    }

    private void saveCodeConfiguration(Question question, CodeConfigDto config) {
        String allowedLanguages = writeJson(config.getAllowedLanguages() == null ? List.of() : config.getAllowedLanguages());
        codeQuestionConfigRepository.save(CodeQuestionConfig.builder()
                .questionId(question.getQuestionId())
                .allowedLanguages(allowedLanguages)
                .codeTemplate(config.getCodeTemplate())
                .timeLimitMs(config.getTimeLimitMs() == null ? 5000 : config.getTimeLimitMs())
                .memoryLimitKb(config.getMemoryLimitKb() == null ? 262144 : config.getMemoryLimitKb())
                .createdAt(java.time.Instant.now())
                .updatedAt(java.time.Instant.now())
                .build());
    }

    private void saveTestCases(Question question, List<TestCaseDto> testCases) {
        List<CodeTestCase> rows = new java.util.ArrayList<>();
        for (int i = 0; i < testCases.size(); i++) {
            TestCaseDto testCase = testCases.get(i);
            rows.add(CodeTestCase.builder()
                    .question(question)
                    .inputData(testCase.getInputData())
                    .expectedOutput(testCase.getExpectedOutput())
                    .hidden(Boolean.TRUE.equals(testCase.getHidden()))
                    .orderIndex(testCase.getOrderIndex() == null ? i : testCase.getOrderIndex())
                    .createdAt(java.time.Instant.now())
                    .build());
        }
        codeTestCaseRepository.saveAll(rows);
    }

    private <T> T readJson(String value, TypeReference<T> type) {
        if (value == null || value.isBlank()) return null;
        try {
            return objectMapper.readValue(value, type);
        } catch (Exception ex) {
            throw new IllegalArgumentException("Invalid stored question contribution JSON", ex);
        }
    }

    private String writeJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (Exception ex) {
            throw new IllegalArgumentException("Unable to encode code configuration", ex);
        }
    }
}
