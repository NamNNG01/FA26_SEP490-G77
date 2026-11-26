package com.examprep.services.student;

import com.examprep.dto.ResponseCode;
import com.examprep.dto.question.AnswerOptionDto;
import com.examprep.dto.question.QuestionCreateRequest;
import com.examprep.dto.student.ContributionDetailDto;
import com.examprep.dto.student.ContributionItemDto;
import com.examprep.entities.QuestionContribution;
import com.examprep.exceptions.BadRequestException;
import com.examprep.exceptions.BaseException;
import com.examprep.exceptions.ForbiddenException;
import com.examprep.exceptions.ResourceNotFoundException;
import com.examprep.exceptions.ResourceConflictException;
import com.examprep.repositories.*;
import com.examprep.util.ContentHashUtil;
import com.examprep.util.validation.QuestionPayload;
import com.examprep.util.validation.QuestionValidator;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.Set;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional
public class StudentContributionServiceImpl implements StudentContributionService {

    private final QuestionContributionRepository contributionRepository;
    private final QuestionRepository questionRepository;
    private final EnrollmentRepository enrollmentRepository;
    private final CourseRepository courseRepository;
    private final ModuleRepository moduleRepository;
    private final QuestionGroupRepository questionGroupRepository;
    private final QuestionValidator questionValidator;
    private final ObjectMapper objectMapper;

    private void validateActiveEnrollment(Long courseId, Long userId) {
        if (userId == null) {
            throw new ForbiddenException("Authentication required");
        }
        if (courseId == null || !courseRepository.existsById(courseId)) {
            throw new ResourceNotFoundException("Course not found");
        }
        boolean active = enrollmentRepository.existsByCourse_CourseIdAndUser_UserIdAndStatus(courseId, userId, "ACTIVE");
        if (!active) {
            throw new ForbiddenException("Student is not actively enrolled in this course");
        }
    }

    private String writeJson(Object obj) {
        if (obj == null) return null;
        try {
            return objectMapper.writeValueAsString(obj);
        } catch (Exception e) {
            return null;
        }
    }

    private <T> T readJson(String json, TypeReference<T> ref) {
        if (json == null || json.isBlank()) return null;
        try {
            return objectMapper.readValue(json, ref);
        } catch (Exception e) {
            return null;
        }
    }

    @Override
    public Map<String, Object> createQuestionContribution(QuestionCreateRequest request, Long userId) {
        if (request == null || request.getCourseId() == null) {
            throw new BadRequestException("Invalid request data");
        }
        validateActiveEnrollment(request.getCourseId(), userId);

        if (request.getModuleId() != null) {
            moduleRepository.findById(request.getModuleId())
                    .filter(m -> m.getCourse().getCourseId().equals(request.getCourseId()))
                    .orElseThrow(() -> new ResourceNotFoundException("Module not found or does not belong to course"));
        }

        if (request.getGroupId() != null) {
            questionGroupRepository.findById(request.getGroupId())
                    .filter(g -> g.getCourse().getCourseId().equals(request.getCourseId()))
                    .orElseThrow(() -> new ResourceNotFoundException("Question group not found or does not belong to course"));
        }

        questionValidator.validateOrThrow(QuestionPayload.from(request));
        rejectIfQuestionAlreadyExists(request);

        QuestionContribution contribution = QuestionContribution.builder()
                .userId(userId)
                .courseId(request.getCourseId())
                .type("QUESTION")
                .content(request.getContent())
                .moduleId(request.getModuleId())
                .groupId(request.getGroupId())
                .questionType(request.getQuestionType())
                .optionsJson(writeJson(request.getOptions()))
                .answerKeyJson(writeJson(request.getAnswerKey()))
                .explanation(request.getExplanation())
                .difficulty(request.getDifficulty())
                .essayGradingRubricJson(writeJson(request.getEssayGradingRubric()))
                .questionMetadataJson(writeJson(request.getQuestionMetadata()))
                .codeConfigJson(writeJson(request.getCodeConfig()))
                .testCasesJson(writeJson(request.getTestCases()))
                .status("PENDING")
                .resubmissionCount(0)
                .build();

        QuestionContribution saved = contributionRepository.save(contribution);

        return Map.of(
                "contributionId", saved.getContributionId(),
                "status", saved.getStatus(),
                "createdAt", saved.getSubmittedAt() != null ? saved.getSubmittedAt().toString() : ""
        );
    }

    @Override
    @Transactional(readOnly = true)
    public Page<ContributionItemDto> listContributions(String type, String status, int page, int size, Long userId) {
        if (userId == null) {
            throw new ForbiddenException("Authentication required");
        }
        String normalizedType = (type != null && !type.isBlank()) ? type.trim().toUpperCase() : null;
        String normalizedStatus = (status != null && !status.isBlank()) ? status.trim().toUpperCase() : null;

        Pageable pageable = PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "submittedAt"));
        Page<QuestionContribution> contributions = contributionRepository.findByStudentAndFilters(userId, normalizedType, normalizedStatus, pageable);

        return contributions.map(c -> {
            String summary = c.getTitle();
            if (summary == null || summary.isBlank()) {
                String content = c.getContent();
                if (content != null) {
                    summary = content.length() > 100 ? content.substring(0, 100) + "..." : content;
                } else {
                    summary = "Contribution #" + c.getContributionId();
                }
            }
            return ContributionItemDto.builder()
                    .contributionId(c.getContributionId())
                    .type(c.getType())
                    .status(c.getStatus())
                    .summary(summary)
                    .createdAt(c.getSubmittedAt())
                    .reviewedAt(c.getReviewedAt())
                    .resubmissionCount(c.getResubmissionCount())
                    .build();
        });
    }

    @Override
    @Transactional(readOnly = true)
    public ContributionDetailDto getContributionDetail(Long contributionId, Long userId) {
        if (userId == null) {
            throw new ForbiddenException("Authentication required");
        }
        QuestionContribution c = contributionRepository.findById(contributionId)
                .orElseThrow(() -> new ResourceNotFoundException("Contribution not found"));

        if (!c.getUserId().equals(userId)) {
            throw new ForbiddenException("Only the owner can view this contribution");
        }

        List<AnswerOptionDto> options = readJson(c.getOptionsJson(), new TypeReference<>() {
        });
        Object answerKey = readJson(c.getAnswerKeyJson(), new TypeReference<>() {
        });
        Object essayGradingRubric = readJson(c.getEssayGradingRubricJson(), new TypeReference<>() {
        });
        Object questionMetadata = readJson(c.getQuestionMetadataJson(), new TypeReference<>() {
        });

        return ContributionDetailDto.builder()
                .contributionId(c.getContributionId())
                .courseId(c.getCourseId())
                .type(c.getType())
                .status(c.getStatus())
                .title(c.getTitle())
                .content(c.getContent())
                .moduleId(c.getModuleId())
                .groupId(c.getGroupId())
                .questionType(c.getQuestionType())
                .options(options)
                .answerKey(answerKey)
                .explanation(c.getExplanation())
                .difficulty(c.getDifficulty())
                .essayGradingRubric(essayGradingRubric)
                .questionMetadata(questionMetadata)
                .codeConfig(readJson(c.getCodeConfigJson(), new TypeReference<>() {
                }))
                .testCases(readJson(c.getTestCasesJson(), new TypeReference<>() {
                }))
                .sourceReference(c.getSourceReference())
                .reviewNote(c.getReviewNote())
                .resubmissionCount(c.getResubmissionCount())
                .createdAt(c.getSubmittedAt())
                .reviewedAt(c.getReviewedAt())
                .build();
    }

    @Override
    public Map<String, Object> resubmitContribution(Long contributionId, Object requestBody, Long userId) {
        if (userId == null) {
            throw new ForbiddenException("Authentication required");
        }
        QuestionContribution c = contributionRepository.findById(contributionId)
                .orElseThrow(() -> new ResourceNotFoundException("Contribution not found"));

        if (!c.getUserId().equals(userId)) {
            throw new ForbiddenException("Only the owner can resubmit this contribution");
        }

        if (!"REJECTED".equals(c.getStatus())) {
            throw new BaseException(ResponseCode.CONFLICT, "Only rejected contributions can be resubmitted", Map.of("code", "NOT_REJECTED"));
        }
        int currentResubmissions = c.getResubmissionCount() != null ? c.getResubmissionCount() : 0;
        if (currentResubmissions >= 1) {
            throw new BaseException(ResponseCode.CONFLICT, "Contribution has already been resubmitted the maximum number of times", Map.of("code", "RESUBMISSION_LIMIT_REACHED"));
        }

        if (!"QUESTION".equals(c.getType())) {
            throw new BadRequestException("Only question contributions can be resubmitted");
        }

        QuestionCreateRequest qReq;
        if (requestBody instanceof QuestionCreateRequest) {
            qReq = (QuestionCreateRequest) requestBody;
        } else {
            qReq = objectMapper.convertValue(requestBody, QuestionCreateRequest.class);
        }
        if (qReq.getCourseId() == null) {
            qReq.setCourseId(c.getCourseId());
        }
        validateActiveEnrollment(qReq.getCourseId(), userId);
        questionValidator.validateOrThrow(QuestionPayload.from(qReq));
        rejectIfQuestionAlreadyExists(qReq);

        c.setCourseId(qReq.getCourseId());
        c.setContent(qReq.getContent());
        c.setModuleId(qReq.getModuleId());
        c.setGroupId(qReq.getGroupId());
        c.setQuestionType(qReq.getQuestionType());
        c.setOptionsJson(writeJson(qReq.getOptions()));
        c.setAnswerKeyJson(writeJson(qReq.getAnswerKey()));
        c.setExplanation(qReq.getExplanation());
        c.setDifficulty(qReq.getDifficulty());
        c.setCategoryIds(null);
        c.setEssayGradingRubricJson(writeJson(qReq.getEssayGradingRubric()));
        c.setQuestionMetadataJson(writeJson(qReq.getQuestionMetadata()));
        c.setCodeConfigJson(writeJson(qReq.getCodeConfig()));
        c.setTestCasesJson(writeJson(qReq.getTestCases()));

        c.setStatus("PENDING");
        c.setResubmissionCount(currentResubmissions + 1);
        c.setReviewNote(null);
        QuestionContribution saved = contributionRepository.save(c);

        return Map.of(
                "contributionId", saved.getContributionId(),
                "status", saved.getStatus(),
                "resubmissionCount", saved.getResubmissionCount()
        );
    }

    /**
     * Student contributions use the same content hash as manager-created questions so that
     * whitespace and option ordering cannot bypass the course-level duplicate check.
     */
    private void rejectIfQuestionAlreadyExists(QuestionCreateRequest request) {
        List<String> optionTexts = request.getOptions() == null
                ? null
                : request.getOptions().stream().map(AnswerOptionDto::getOptionText).toList();
        String contentHash = ContentHashUtil.computeHash(request.getContent(), optionTexts);
        if (!questionRepository.findExistingContentHashes(request.getCourseId(), Set.of(contentHash)).isEmpty()) {
            throw new ResourceConflictException("Question already exists in course");
        }
    }
}
