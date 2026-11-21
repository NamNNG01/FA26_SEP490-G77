package com.examprep.services.manager.review;

import com.examprep.dto.question.CodeConfigDto;
import com.examprep.dto.question.TestCaseDto;
import com.examprep.entities.*;
import com.examprep.exceptions.ResourceConflictException;
import com.examprep.repositories.*;
import com.examprep.util.validation.QuestionPayload;
import com.examprep.util.validation.QuestionValidator;
import com.examprep.util.ContentHashUtil;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.HashMap;
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

        List<String> optionTexts = rawOptions != null
                ? rawOptions.stream().map(o -> questionValidator.sanitize((String) o.get("optionText"))).toList()
                : null;
        String sanitizedContent = questionValidator.sanitize(c.getContent());
        String contentHash = ContentHashUtil.computeHash(sanitizedContent, optionTexts);
        if (course != null && !questionRepository
                .findDuplicateQuestionIds(course.getCourseId(), contentHash, null, Pageable.ofSize(1))
                .isEmpty()) {
            throw new ResourceConflictException("Question already exists in course");
        }

        String rubricJson = c.getEssayGradingRubricJson();
        String metadataJson = c.getQuestionMetadataJson();
        String answerKeyJson = c.getAnswerKeyJson();
        boolean isOrdering = "ORDERING".equals(questionType);

        Question question = Question.builder()
                .course(course)
                .module(module)
                .group(group)
                .createdBy(User.builder().userId(c.getUserId()).build())
                .questionType(questionType)
                .difficulty(c.getDifficulty() != null ? c.getDifficulty() : "MEDIUM")
                .content(sanitizedContent)
                .questionMetadata(metadataJson)
                .answerKey(answerKeyJson)
                .source("STUDENT_CONTRIBUTION")
                .creatorRole("STUDENT")
                .approvalStatus("APPROVED")
                .status("ACTIVE")
                .aiExplanation(questionValidator.sanitize(c.getExplanation()))
                .essayGradingRubric(rubricJson)
                .contentHash(contentHash)
                .scoringVersion(1)
                .lockVersion(0L)
                .build();

        Question savedQuestion = questionRepository.save(question);

        if (rawOptions != null) {
            List<AnswerOption> savedOptions = new ArrayList<>(rawOptions.size());
            for (int i = 0; i < rawOptions.size(); i++) {
                Map<String, Object> optMap = rawOptions.get(i);
                String optText = questionValidator.sanitize((String) optMap.get("optionText"));
                Boolean isCorrect = isOrdering ? Boolean.FALSE
                        : (optMap.get("isCorrect") instanceof Boolean b ? b : false);
                String optExpl = questionValidator.sanitize((String) optMap.get("explanation"));
                Integer orderIdx = optMap.get("orderIndex") instanceof Number n ? n.intValue() : i;

                AnswerOption option = AnswerOption.builder()
                        .question(savedQuestion)
                        .optionText(optText)
                        .isCorrect(isCorrect)
                        .explanation(optExpl)
                        .orderIndex(orderIdx)
                        .build();
                savedOptions.add(answerOptionRepository.save(option));
            }
            if (isOrdering) {
                Map<String, Long> keyToIdMap = new HashMap<>();
                for (int i = 0; i < rawOptions.size(); i++) {
                    Object rawKey = rawOptions.get(i).get("key");
                    String key = rawKey != null ? rawKey.toString() : String.valueOf(i);
                    keyToIdMap.put(key, savedOptions.get(i).getOptionId());
                }
                List<Object> correctOrder = payload.getCorrectOrder();
                if (correctOrder == null && payload.getAnswerKey() instanceof Map<?, ?> akMap
                        && akMap.get("correctOrder") instanceof List<?> list) {
                    correctOrder = new ArrayList<>(list);
                }
                List<Long> orderedOptionIds = new ArrayList<>();
                if (correctOrder != null) {
                    for (Object item : correctOrder) {
                        String itemStr = item != null ? item.toString() : "";
                        Long optionId = keyToIdMap.get(itemStr);
                        if (optionId == null) {
                            try {
                                optionId = Long.parseLong(itemStr);
                            } catch (NumberFormatException ignored) {}
                        }
                        if (optionId == null) {
                            throw new IllegalArgumentException("Invalid option in correct order: " + itemStr);
                        }
                        orderedOptionIds.add(optionId);
                    }
                }
                savedQuestion.setAnswerKey(writeJson(Map.of("correctOrder", orderedOptionIds)));
                savedQuestion = questionRepository.save(savedQuestion);
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
        String allowedLanguages = writeJson(config.getAllowedLanguages());
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
