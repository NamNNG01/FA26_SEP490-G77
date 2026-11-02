package com.examprep.services.manager.review;

import com.examprep.entities.*;
import com.examprep.repositories.*;
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
    private final ObjectMapper objectMapper;

    @Transactional(propagation = Propagation.MANDATORY)
    public Question promoteContribution(QuestionContribution c, Course course, com.examprep.entities.Module module, QuestionGroup group, User reviewer) {
        if (c.getContent() == null || c.getContent().isBlank()) {
            throw new IllegalArgumentException("Question content cannot be blank");
        }

        String questionType = c.getQuestionType() != null ? c.getQuestionType() : "SINGLE_CHOICE";

        List<Map<String, Object>> rawOptions = null;
        if (c.getOptionsJson() != null && !c.getOptionsJson().isBlank()) {
            try {
                rawOptions = objectMapper.readValue(c.getOptionsJson(), new TypeReference<>() {});
            } catch (Exception ignored) {}
        }

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

        return savedQuestion;
    }
}
