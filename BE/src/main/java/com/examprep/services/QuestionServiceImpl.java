package com.examprep.services;

import com.examprep.ai.AiClient;
import com.examprep.ai.AiRequest;
import com.examprep.ai.AiResponse;
import com.examprep.dto.ResponseCode;
import com.examprep.dto.question.*;
import com.examprep.entities.*;
import com.examprep.exceptions.BadRequestException;
import com.examprep.exceptions.ForbiddenException;
import com.examprep.exceptions.QuestionValidationException;
import com.examprep.exceptions.ResourceConflictException;
import com.examprep.exceptions.ResourceNotFoundException;
import com.examprep.exceptions.UnauthorizedException;
import com.examprep.repositories.*;
import com.examprep.security.QuestionAccessPolicy;
import com.examprep.validation.QuestionPayload;
import com.examprep.validation.QuestionValidator;
import com.examprep.validation.ValidationError;
import com.examprep.util.ContentHashUtil;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.core.io.ClassPathResource;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.FileCopyUtils;
import org.springframework.web.multipart.MultipartFile;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.*;
import java.util.stream.Collectors;
import lombok.extern.slf4j.Slf4j;

@Slf4j
@Service
@RequiredArgsConstructor
public class QuestionServiceImpl implements QuestionService {

    private final QuestionRepository questionRepository;
    private final AnswerOptionRepository answerOptionRepository;
    private final CourseRepository courseRepository;
    private final ModuleRepository moduleRepository;
    private final QuestionGroupRepository questionGroupRepository;
    private final CourseManagerRepository courseManagerRepository;
    private final ExamQuestionRepository examQuestionRepository;
    private final AttemptAnswerRepository attemptAnswerRepository;
    private final DocumentRepository documentRepository;
    private final UserSubscriptionRepository userSubscriptionRepository;
    private final AiUsageLogRepository aiUsageLogRepository;
    private final AiClient aiClient;
    private final QuestionAccessPolicy accessPolicy;
    private final QuestionValidator questionValidator;
    private final ObjectMapper objectMapper;

    @Override
    @Transactional(readOnly = true)
    public Page<QuestionListItemDto> getQuestions(Long courseId, Long moduleId, Long groupId, String questionType,
                                                  String difficulty, String status, String approvalStatus, String creatorRole,
                                                  String source, Long createdBy, String skillTag, String search,
                                                  Pageable pageable, User currentUser) {
        if (!User.ROLE_ADMIN.equals(currentUser.getRoleName()) && courseId != null) {
            boolean isManager = courseManagerRepository.existsByCourse_CourseIdAndUser_UserId(courseId, currentUser.getUserId());
            if (!isManager) {
                throw new ForbiddenException("You do not have access to this course");
            }
        }

        Specification<Question> spec = (root, query, cb) -> {
            var predicate = cb.isNull(root.get("deletedAt"));
            if (courseId != null) {
                predicate = cb.and(predicate, cb.equal(root.get("course").get("courseId"), courseId));
            }
            if (moduleId != null) {
                predicate = cb.and(predicate, cb.equal(root.get("module").get("moduleId"), moduleId));
            }
            if (groupId != null) {
                predicate = cb.and(predicate, cb.equal(root.get("group").get("groupId"), groupId));
            }
            if (questionType != null) {
                predicate = cb.and(predicate, cb.equal(root.get("questionType"), questionType));
            }
            if (difficulty != null) {
                predicate = cb.and(predicate, cb.equal(root.get("difficulty"), difficulty));
            }
            if (status != null) {
                predicate = cb.and(predicate, cb.equal(root.get("status"), status));
            }
            if (approvalStatus != null) {
                predicate = cb.and(predicate, cb.equal(root.get("approvalStatus"), approvalStatus));
            }
            if (creatorRole != null) {
                predicate = cb.and(predicate, cb.equal(root.get("creatorRole"), creatorRole));
            }
            if (source != null) {
                predicate = cb.and(predicate, cb.equal(root.get("source"), source));
            }
            if (createdBy != null) {
                predicate = cb.and(predicate, cb.equal(root.get("createdBy").get("userId"), createdBy));
            }
            if (skillTag != null) {
                predicate = cb.and(predicate, cb.like(cb.function("jsonb_extract_path_text", String.class, root.get("questionMetadata"), cb.literal("skillTag")), "%" + skillTag + "%"));
            }
            if (search != null && !search.trim().isEmpty()) {
                predicate = cb.and(predicate, cb.like(cb.lower(root.get("content")), "%" + search.trim().toLowerCase() + "%"));
            }
            return predicate;
        };

        Page<Question> page = questionRepository.findAll(spec, pageable);
        return page.map(q -> QuestionListItemDto.builder()
                .questionId(q.getQuestionId())
                .content(q.getContent())
                .courseId(q.getCourse() != null ? q.getCourse().getCourseId() : null)
                .courseName(q.getCourse() != null ? q.getCourse().getTitle() : null)
                .moduleId(q.getModule() != null ? q.getModule().getModuleId() : null)
                .moduleName(q.getModule() != null ? q.getModule().getTitle() : null)
                .groupId(q.getGroup() != null ? q.getGroup().getGroupId() : null)
                .questionType(q.getQuestionType())
                .difficulty(q.getDifficulty())
                .status(q.getStatus())
                .approvalStatus(q.getApprovalStatus())
                .creatorRole(q.getCreatorRole())
                .source(q.getSource())
                .createdBy(q.getCreatedBy() != null ? q.getCreatedBy().getUserId() : null)
                .scoringVersion(q.getScoringVersion())
                .lockVersion(q.getLockVersion())
                .optionCount(questionRepository.countOptionsByQuestionId(q.getQuestionId()))
                .updatedAt(q.getUpdatedAt())
                .build());
    }

    @Override
    @Transactional
    public QuestionDetailDto createQuestion(QuestionCreateRequest req, User currentUser) {
        return createQuestionInternal(req, currentUser, "MANUAL", "MANAGER", "APPROVED");
    }

    public QuestionDetailDto createQuestionInternal(QuestionCreateRequest req, User currentUser, String source, String creatorRole, String approvalStatus) {
        if (req.getCourseId() == null) {
            throw new BadRequestException("Course ID is required");
        }
        Course course = courseRepository.findById(req.getCourseId())
                .orElseThrow(() -> new ResourceNotFoundException("Course not found"));

        if (!User.ROLE_ADMIN.equals(currentUser.getRoleName())) {
            boolean isManager = courseManagerRepository.existsByCourse_CourseIdAndUser_UserId(course.getCourseId(), currentUser.getUserId());
            if (!isManager) {
                throw new ForbiddenException("You are not a manager of this course");
            }
        }

        com.examprep.entities.Module module = null;
        if (req.getModuleId() != null) {
            module = moduleRepository.findById(req.getModuleId())
                    .orElseThrow(() -> new ResourceNotFoundException("Module not found"));
            if (!module.getCourse().getCourseId().equals(course.getCourseId())) {
                throw new BadRequestException("Module does not belong to the specified course");
            }
        }

        QuestionGroup group = null;
        if (req.getGroupId() != null) {
            group = questionGroupRepository.findById(req.getGroupId())
                    .orElseThrow(() -> new ResourceNotFoundException("Question group not found"));
            if (group.getCourse() == null || !group.getCourse().getCourseId().equals(course.getCourseId())) {
                throw new BadRequestException("Question group does not belong to the specified course");
            }
            if (req.getModuleId() != null && group.getModule() != null) {
                if (!group.getModule().getModuleId().equals(req.getModuleId())) {
                    throw new BadRequestException("Question group does not belong to the specified module");
                }
            }
        }

        // Run shared validator
        QuestionPayload payload = QuestionPayload.from(req);
        questionValidator.validateOrThrow(payload);

        String sanitizedContent = questionValidator.sanitize(req.getContent());
        String sanitizedExplanation = questionValidator.sanitize(req.getExplanation());

        validateMetadataKeys(req.getQuestionMetadata());
        String metadataJson = serializeJson(req.getQuestionMetadata(), "questionMetadata");
        String answerKeyJson = serializeJson(req.getAnswerKey(), "answerKey");
        String rubricJson = serializeJson(req.getEssayGradingRubric(), "essayGradingRubric");

        List<String> optionTexts = req.getOptions() != null ?
                req.getOptions().stream().map(o -> questionValidator.sanitize(o.getOptionText())).collect(Collectors.toList()) : null;

        String contentHash = ContentHashUtil.computeHash(sanitizedContent, optionTexts, answerKeyJson);

        // Check duplicate content hash in course (non-deleted)
        checkContentHashConflict(course.getCourseId(), contentHash, null);

        String status = req.getStatus() != null ? req.getStatus() : "ACTIVE";
        if ("STUDENT".equals(creatorRole)) {
            status = "DRAFT";
            approvalStatus = "PENDING";
        }

        Question question = Question.builder()
                .course(course)
                .module(module)
                .group(group)
                .createdBy(currentUser)
                .questionType(req.getQuestionType())
                .difficulty(req.getDifficulty() != null ? req.getDifficulty() : "MEDIUM")
                .content(sanitizedContent)
                .questionMetadata(metadataJson)
                .answerKey(answerKeyJson)
                .defaultPoints(req.getDefaultPoints() != null ? req.getDefaultPoints() : BigDecimal.ONE)
                .source(source != null ? source : "MANUAL")
                .creatorRole(creatorRole != null ? creatorRole : "MANAGER")
                .approvalStatus(approvalStatus != null ? approvalStatus : "APPROVED")
                .status(status)
                .aiExplanation(sanitizedExplanation)
                .essayGradingRubric(rubricJson)
                .contentHash(contentHash)
                .scoringVersion(1)
                .lockVersion(0L)
                .build();

        question = questionRepository.save(question);

        List<AnswerOption> optionsToSave = new ArrayList<>();
        if (req.getOptions() != null) {
            for (int i = 0; i < req.getOptions().size(); i++) {
                AnswerOptionDto optDto = req.getOptions().get(i);
                AnswerOption opt = AnswerOption.builder()
                        .question(question)
                        .optionText(questionValidator.sanitize(optDto.getOptionText()))
                        .isCorrect(optDto.getIsCorrect() != null ? optDto.getIsCorrect() : false)
                        .explanation(questionValidator.sanitize(optDto.getExplanation()))
                        .orderIndex(optDto.getOrderIndex() != null ? optDto.getOrderIndex() : i)
                        .build();
                optionsToSave.add(opt);
            }
        }

        List<AnswerOption> savedOptions = answerOptionRepository.saveAll(optionsToSave);

        return mapToDetailDto(question, savedOptions);
    }

    @Override
    @Transactional
    public List<QuestionDetailDto> createQuestionsBatch(Long courseId, Long moduleId, List<QuestionCreateRequest> requests, User currentUser) {
        if (requests == null || requests.isEmpty() || requests.size() > 50) {
            throw new BadRequestException("Batch size must be between 1 and 50");
        }

        List<ValidationError> allErrors = new ArrayList<>();
        for (int i = 0; i < requests.size(); i++) {
            QuestionCreateRequest req = requests.get(i);
            req.setCourseId(courseId);
            if (moduleId != null) {
                req.setModuleId(moduleId);
            }
            QuestionPayload payload = QuestionPayload.from(req);
            List<ValidationError> errs = questionValidator.validate(payload, "questions[" + i + "].");
            allErrors.addAll(errs);
        }

        if (!allErrors.isEmpty()) {
            throw new QuestionValidationException(allErrors);
        }

        List<QuestionDetailDto> results = new ArrayList<>();
        for (QuestionCreateRequest req : requests) {
            results.add(createQuestionInternal(req, currentUser, "MANUAL", "MANAGER", "APPROVED"));
        }
        return results;
    }

    @Override
    @Transactional(readOnly = true)
    public QuestionDetailDto getQuestionById(Long id, User currentUser) {
        Question q = questionRepository.findActiveById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Question not found"));
        if (!accessPolicy.canView(currentUser, q)) {
            throw new ForbiddenException("You do not have permission to view this question");
        }
        List<AnswerOption> options = answerOptionRepository.findByQuestion_QuestionId(q.getQuestionId());
        return mapToDetailDto(q, options);
    }

    @Override
    @Transactional
    public QuestionDetailDto updateQuestion(Long id, QuestionUpdateRequest req, User currentUser) {
        Question q = questionRepository.findActiveById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Question not found"));

        if (!accessPolicy.canModify(currentUser, q)) {
            throw new ForbiddenException("You do not have permission to modify this question");
        }

        if (req.getLockVersion() != null && !req.getLockVersion().equals(q.getLockVersion())) {
            throw new ResourceConflictException("Resource was modified by another user (lock version mismatch)");
        }

        String typeToValidate = req.getQuestionType() != null ? req.getQuestionType() : q.getQuestionType();
        if (req.getQuestionType() != null && !req.getQuestionType().equals(q.getQuestionType())) {
            if (attemptAnswerRepository.existsByQuestion_QuestionId(q.getQuestionId())) {
                throw new ResourceConflictException("Cannot change question type when student attempts reference this question");
            }
            questionValidator.validateQuestionType(req.getQuestionType());
            q.setQuestionType(req.getQuestionType());
        }

        // Build merged payload for validation
        List<AnswerOptionDto> optionsToValidate = req.getOptions();
        if (optionsToValidate == null) {
            List<AnswerOption> existingOpts = answerOptionRepository.findByQuestion_QuestionId(q.getQuestionId());
            optionsToValidate = existingOpts.stream().map(o -> AnswerOptionDto.builder()
                    .optionId(o.getOptionId())
                    .optionText(o.getOptionText())
                    .isCorrect(o.getIsCorrect())
                    .explanation(o.getExplanation())
                    .orderIndex(o.getOrderIndex())
                    .build()).collect(Collectors.toList());
        }

        Object metadataToValidate = req.getQuestionMetadata() != null ? req.getQuestionMetadata() : parseJson(q.getQuestionMetadata());
        Object answerKeyToValidate = req.getAnswerKey() != null ? req.getAnswerKey() : parseJson(q.getAnswerKey());
        Object rubricToValidate = req.getEssayGradingRubric() != null ? req.getEssayGradingRubric() : parseJson(q.getEssayGradingRubric());
        BigDecimal pointsToValidate = req.getDefaultPoints() != null ? req.getDefaultPoints() : q.getDefaultPoints();
        String contentToValidate = req.getContent() != null ? req.getContent() : q.getContent();
        String difficultyToValidate = req.getDifficulty() != null ? req.getDifficulty() : q.getDifficulty();
        String statusToValidate = req.getStatus() != null ? req.getStatus() : q.getStatus();

        QuestionPayload payload = QuestionPayload.builder()
                .questionType(typeToValidate)
                .difficulty(difficultyToValidate)
                .status(statusToValidate)
                .content(contentToValidate)
                .defaultPoints(pointsToValidate)
                .questionMetadata(metadataToValidate)
                .answerKey(answerKeyToValidate)
                .essayGradingRubric(rubricToValidate)
                .options(optionsToValidate)
                .build();

        questionValidator.validateOrThrow(payload);

        boolean scoreAffectingChanged = false;

        if (req.getContent() != null) {
            String sanitized = questionValidator.sanitize(req.getContent());
            if (!sanitized.equals(q.getContent())) {
                q.setContent(sanitized);
            }
        }
        if (req.getDifficulty() != null) q.setDifficulty(req.getDifficulty());
        if (req.getStatus() != null) q.setStatus(req.getStatus());
        if (req.getExplanation() != null) q.setAiExplanation(questionValidator.sanitize(req.getExplanation()));

        if (req.getDefaultPoints() != null) {
            if (req.getDefaultPoints().compareTo(q.getDefaultPoints()) != 0) {
                q.setDefaultPoints(req.getDefaultPoints());
                scoreAffectingChanged = true;
            }
        }

        if (req.getQuestionMetadata() != null) {
            validateMetadataKeys(req.getQuestionMetadata());
            q.setQuestionMetadata(serializeJson(req.getQuestionMetadata(), "questionMetadata"));
        }

        if (req.getAnswerKey() != null) {
            String akJson = serializeJson(req.getAnswerKey(), "answerKey");
            if (!akJson.equals(q.getAnswerKey())) {
                q.setAnswerKey(akJson);
                scoreAffectingChanged = true;
            }
        }

        if (req.getEssayGradingRubric() != null) {
            String rubricJson = serializeJson(req.getEssayGradingRubric(), "essayGradingRubric");
            if (!rubricJson.equals(q.getEssayGradingRubric())) {
                q.setEssayGradingRubric(rubricJson);
                scoreAffectingChanged = true;
            }
        }

        List<AnswerOption> existingOptions = answerOptionRepository.findByQuestion_QuestionId(q.getQuestionId());
        Map<Long, AnswerOption> existingMap = existingOptions.stream().collect(Collectors.toMap(AnswerOption::getOptionId, o -> o));

        List<AnswerOption> updatedOptions = new ArrayList<>();
        if (req.getOptions() != null) {
            Set<Long> incomingIds = req.getOptions().stream()
                    .map(AnswerOptionDto::getOptionId)
                    .filter(Objects::nonNull)
                    .collect(Collectors.toSet());

            for (AnswerOption existing : existingOptions) {
                if (!incomingIds.contains(existing.getOptionId())) {
                    answerOptionRepository.delete(existing);
                    scoreAffectingChanged = true;
                }
            }

            for (int i = 0; i < req.getOptions().size(); i++) {
                AnswerOptionDto dto = req.getOptions().get(i);
                if (dto.getOptionId() != null && existingMap.containsKey(dto.getOptionId())) {
                    AnswerOption opt = existingMap.get(dto.getOptionId());
                    String text = questionValidator.sanitize(dto.getOptionText());
                    boolean correct = dto.getIsCorrect() != null ? dto.getIsCorrect() : false;
                    if (!opt.getOptionText().equals(text) || !opt.getIsCorrect().equals(correct)) {
                        scoreAffectingChanged = true;
                    }
                    opt.setOptionText(text);
                    opt.setIsCorrect(correct);
                    opt.setExplanation(questionValidator.sanitize(dto.getExplanation()));
                    opt.setOrderIndex(dto.getOrderIndex() != null ? dto.getOrderIndex() : i);
                    updatedOptions.add(opt);
                } else {
                    AnswerOption opt = AnswerOption.builder()
                            .question(q)
                            .optionText(questionValidator.sanitize(dto.getOptionText()))
                            .isCorrect(dto.getIsCorrect() != null ? dto.getIsCorrect() : false)
                            .explanation(questionValidator.sanitize(dto.getExplanation()))
                            .orderIndex(dto.getOrderIndex() != null ? dto.getOrderIndex() : i)
                            .build();
                    updatedOptions.add(opt);
                    scoreAffectingChanged = true;
                }
            }
            updatedOptions = answerOptionRepository.saveAll(updatedOptions);
        } else {
            updatedOptions = existingOptions;
        }

        if (scoreAffectingChanged) {
            q.setScoringVersion(q.getScoringVersion() + 1);
        }

        List<String> optionTexts = updatedOptions.stream().map(AnswerOption::getOptionText).collect(Collectors.toList());
        String newHash = ContentHashUtil.computeHash(q.getContent(), optionTexts, q.getAnswerKey());
        checkContentHashConflict(q.getCourse() != null ? q.getCourse().getCourseId() : null, newHash, q.getQuestionId());
        q.setContentHash(newHash);

        q = questionRepository.save(q);
        return mapToDetailDto(q, updatedOptions);
    }

    @Override
    @Transactional
    public void deleteQuestion(Long id, User currentUser) {
        Question q = questionRepository.findActiveById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Question not found"));

        if (!accessPolicy.canModify(currentUser, q)) {
            throw new ForbiddenException("You do not have permission to delete this question");
        }

        List<ExamQuestion> examQuestions = examQuestionRepository.findByQuestion_QuestionId(q.getQuestionId());
        for (ExamQuestion eq : examQuestions) {
            if ("PUBLISHED".equals(eq.getExam().getStatus())) {
                throw new ResourceConflictException("Cannot delete question that is part of a published exam");
            }
        }

        examQuestionRepository.deleteByQuestion_QuestionId(q.getQuestionId());
        q.setDeletedAt(Instant.now());
        questionRepository.save(q);
    }

    @Override
    @Transactional
    public QuestionDetailDto duplicateQuestion(Long id, User currentUser) {
        Question original = questionRepository.findActiveById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Question not found"));

        if (!accessPolicy.canView(currentUser, original)) {
            throw new ForbiddenException("You do not have access to this question");
        }

        Question copy = Question.builder()
                .course(original.getCourse())
                .module(original.getModule())
                .group(original.getGroup())
                .createdBy(currentUser)
                .questionType(original.getQuestionType())
                .difficulty(original.getDifficulty())
                .content(original.getContent())
                .questionMetadata(original.getQuestionMetadata())
                .answerKey(original.getAnswerKey())
                .defaultPoints(original.getDefaultPoints())
                .source("MANUAL")
                .creatorRole("MANAGER")
                .approvalStatus("APPROVED")
                .status("DRAFT")
                .aiExplanation(original.getAiExplanation())
                .essayGradingRubric(original.getEssayGradingRubric())
                .contentHash(original.getContentHash())
                .scoringVersion(1)
                .lockVersion(0L)
                .build();

        copy = questionRepository.save(copy);

        List<AnswerOption> originalOptions = answerOptionRepository.findByQuestion_QuestionId(original.getQuestionId());
        List<AnswerOption> copiedOptionsToSave = new ArrayList<>();
        for (AnswerOption origOpt : originalOptions) {
            AnswerOption optCopy = AnswerOption.builder()
                    .question(copy)
                    .optionText(origOpt.getOptionText())
                    .isCorrect(origOpt.getIsCorrect())
                    .explanation(origOpt.getExplanation())
                    .orderIndex(origOpt.getOrderIndex())
                    .build();
            copiedOptionsToSave.add(optCopy);
        }
        List<AnswerOption> copiedOptions = answerOptionRepository.saveAll(copiedOptionsToSave);

        return mapToDetailDto(copy, copiedOptions);
    }

    @Override
    @Transactional
    public QuestionDetailDto updateQuestionStatus(Long id, QuestionStatusRequest req, User currentUser) {
        Question q = questionRepository.findActiveById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Question not found"));

        if (!accessPolicy.canChangeStatus(currentUser, q)) {
            throw new ForbiddenException("You do not have permission to change status of this question");
        }

        if (req.getLockVersion() != null && !req.getLockVersion().equals(q.getLockVersion())) {
            throw new ResourceConflictException("Lock version mismatch");
        }

        String newStatus = req.getStatus();
        if ("ACTIVE".equals(newStatus)) {
            if (!"APPROVED".equals(q.getApprovalStatus())) {
                throw new BadRequestException("Cannot activate question that is not approved");
            }
            List<AnswerOption> options = answerOptionRepository.findByQuestion_QuestionId(q.getQuestionId());
            QuestionPayload payload = QuestionPayload.fromEntity(q, options, objectMapper);
            questionValidator.validateOrThrow(payload);

            checkContentHashConflict(q.getCourse() != null ? q.getCourse().getCourseId() : null, q.getContentHash(), q.getQuestionId());
        }

        q.setStatus(newStatus);
        q = questionRepository.save(q);
        List<AnswerOption> options = answerOptionRepository.findByQuestion_QuestionId(q.getQuestionId());
        return mapToDetailDto(q, options);
    }

    @Override
    public AiGenerateResponse generateAiQuestions(
            AiGenerateRequest request,
            User currentUser
    ) {
        if (request.getCourseId() == null) {
            throw new BadRequestException("Course ID is required");
        }

        if (request.getQuestionTypeCounts() == null
                || request.getQuestionTypeCounts().isEmpty()) {
            throw new BadRequestException(
                    "At least one question type is required"
            );
        }

        Map<String, Integer> typeCounts =
                new LinkedHashMap<>(request.getQuestionTypeCounts());

        int totalCount = 0;

        for (Map.Entry<String, Integer> entry : typeCounts.entrySet()) {
            String type = entry.getKey();
            Integer count = entry.getValue();

            if (type == null || type.isBlank()) {
                throw new BadRequestException(
                        "Question type cannot be empty"
                );
            }

            questionValidator.validateQuestionType(type);

            if (count == null || count <= 0) {
                throw new BadRequestException(
                        "Question count must be greater than 0 for type: "
                                + type
                );
            }

            totalCount = Math.addExact(totalCount, count);
        }

        final int MAX_QUESTIONS_PER_REQUEST = 50;

        if (totalCount > MAX_QUESTIONS_PER_REQUEST) {
            throw new BadRequestException(
                    "Maximum 50 questions per AI generation request"
            );
        }

        Course course = courseRepository.findById(request.getCourseId())
                .orElseThrow(() ->
                        new ResourceNotFoundException("Course not found")
                );

        if (!User.ROLE_ADMIN.equals(currentUser.getRoleName())) {
            boolean isManager =
                    courseManagerRepository
                            .existsByCourse_CourseIdAndUser_UserId(
                                    course.getCourseId(),
                                    currentUser.getUserId()
                            );

            if (!isManager) {
                throw new ForbiddenException(
                        "You are not a manager of this course"
                );
            }
        }

        Instant now = Instant.now();

        UserSubscription sub =
                userSubscriptionRepository
                        .findActiveSubscriptionByUser(
                                currentUser.getUserId(), now
                        )
                        .orElse(null);

        if (sub != null) {
            int usedTokens =
                    aiUsageLogRepository.sumTokensByUserSince(
                            currentUser.getUserId(),
                            sub.getStartDate()
                    );

            int limit = sub.getPlan().getAiTokenLimit();

            int estimatedNewTokens = Math.multiplyExact(totalCount, 300);

            if ((long) usedTokens + estimatedNewTokens > limit) {
                throw new ResourceConflictException(
                        "AI token quota exceeded for current subscription period"
                );
            }
        }

        Document document = null;
        String docContent = "";

        if (request.getDocumentId() != null) {
            document = documentRepository.findById(
                            request.getDocumentId()
                    )
                    .orElseThrow(() ->
                            new ResourceNotFoundException("Document not found")
                    );

            if (document.getCourse() != null
                    && !document.getCourse().getCourseId()
                    .equals(course.getCourseId())) {
                throw new BadRequestException(
                        "Document does not belong to this course"
                );
            }

            docContent = document.getExtractedContent() != null
                    ? document.getExtractedContent()
                    : "";
        }

        String prompt = buildMultiTypePrompt(request, typeCounts, docContent);

        Instant startTime = Instant.now();
        AiResponse aiResponse;

        try {
            aiResponse = aiClient.complete(
                    AiRequest.builder()
                            .prompt(prompt)
                            .systemPrompt(
                                    "You are an expert exam question generator. "
                                            + "Return strictly valid JSON only. "
                                            + "Generate every requested question type "
                                            + "using its required schema. "
                                            + "Do not use Markdown code fences."
                            )
                            .build()
            );
        } catch (Exception e) {
            long duration = Duration.between(
                    startTime, Instant.now()
            ).toMillis();

            AiUsageLog errorLog = AiUsageLog.builder()
                    .user(currentUser)
                    .course(course)
                    .purpose("QUESTION_GEN")
                    .status("FAILED")
                    .errorMessage(e.getMessage())
                    .durationMs((int) Math.min(
                            duration, Integer.MAX_VALUE
                    ))
                    .build();

            aiUsageLogRepository.save(errorLog);

            throw new BadRequestException(
                    ResponseCode.BAD_REQUEST,
                    "AI question generation failed: " + e.getMessage()
            );
        }

        long duration = Duration.between(
                startTime, Instant.now()
        ).toMillis();

        AiUsageLog usageLog = AiUsageLog.builder()
                .user(currentUser)
                .course(course)
                .purpose("QUESTION_GEN")
                .model(aiResponse.getModel())
                .inputTokens(aiResponse.getInputTokens())
                .outputTokens(aiResponse.getOutputTokens())
                .status("SUCCESS")
                .durationMs((int) Math.min(
                        duration, Integer.MAX_VALUE
                ))
                .build();

        usageLog = aiUsageLogRepository.save(usageLog);
        String aiText = aiResponse.getText();

        List<QuestionCreateRequest> parsedQuestions =
                parseAiJson(aiResponse.getText());

        if (parsedQuestions == null || parsedQuestions.isEmpty()) {
            throw new BadRequestException(
                    "AI did not generate any questions"
            );
        }

        Map<String, Integer> actualCounts = new HashMap<>();

        for (QuestionCreateRequest question : parsedQuestions) {
            if (question.getQuestionType() == null) {
                throw new BadRequestException(
                        "AI returned a question without questionType"
                );
            }

            actualCounts.merge(
                    question.getQuestionType(), 1, Integer::sum
            );
        }

        if (parsedQuestions.size() != totalCount
                || !actualCounts.equals(typeCounts)) {
            throw new BadRequestException(
                    "AI returned an incorrect question distribution. "
                            + "Requested: " + typeCounts
                            + ", received: " + actualCounts
            );
        }

        List<AiGenerateResponse.GeneratedQuestionPreview> previews =
                new ArrayList<>();

        List<Question> existingQuestions =
                questionRepository.findAll().stream()
                        .filter(q -> q.getCourse() != null
                                && q.getCourse().getCourseId()
                                .equals(course.getCourseId()))
                        .filter(q -> "ACTIVE".equals(q.getStatus()))
                        .filter(q -> q.getDeletedAt() == null)
                        .toList();

        Set<String> existingHashes = existingQuestions.stream()
                .map(Question::getContentHash)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());

        Set<String> generatedHashes = new HashSet<>();

        for (QuestionCreateRequest qReq : parsedQuestions) {
            qReq.setCourseId(course.getCourseId());
            qReq.setModuleId(request.getModuleId());
            qReq.setDifficulty(
                    request.getDifficulty() != null
                            ? request.getDifficulty()
                            : "MEDIUM"
            );

            String validationError = null;

            try {
                QuestionPayload payload = QuestionPayload.from(qReq);
                questionValidator.validateOrThrow(payload);
            } catch (Exception e) {
                validationError = e.getMessage();
            }

            List<String> optionTexts = qReq.getOptions() != null
                    ? qReq.getOptions().stream()
                    .map(AnswerOptionDto::getOptionText)
                    .collect(Collectors.toList())
                    : null;

            String answerKeyJson = serializeJson(qReq.getAnswerKey(), "answerKey");

            String hash = ContentHashUtil.computeHash(
                    qReq.getContent(), optionTexts, answerKeyJson
            );

            boolean hasConflict = hash != null
                    && (existingHashes.contains(hash)
                    || !generatedHashes.add(hash));

            previews.add(
                    AiGenerateResponse.GeneratedQuestionPreview.builder()
                            .questionData(qReq)
                            .hasHashConflict(hasConflict)
                            .validationError(validationError)
                            .build()
            );
        }

        return AiGenerateResponse.builder()
                .logId(usageLog.getLogId())
                .questions(previews)
                .build();
    }

    private String buildMultiTypePrompt(
            AiGenerateRequest request,
            Map<String, Integer> typeCounts,
            String docContent
    ) {
        String language = request.getLanguage() != null
                ? request.getLanguage()
                : "English";

        String difficulty = request.getDifficulty() != null
                ? request.getDifficulty()
                : "MEDIUM";

        String context = request.getContext() != null
                ? request.getContext()
                : "";

        StringBuilder instructions = new StringBuilder();

        for (Map.Entry<String, Integer> entry : typeCounts.entrySet()) {
            String type = entry.getKey();
            int count = entry.getValue();

            String template = loadPromptTemplate(type);

            if (template == null || template.isBlank()) {
                throw new BadRequestException(
                        "No AI prompt template configured for question type: "
                                + type
                );
            }

            String renderedTemplate = template
                    .replace("{count}", String.valueOf(count))
                    .replace("{language}", language)
                    .replace("{difficulty}", difficulty)
                    .replace("{context}", context)
                    .replace("{document}", docContent);

            instructions.append("\n--- QUESTION TYPE: ")
                    .append(type)
                    .append(" ---\n")
                    .append("Required count: ")
                    .append(count)
                    .append("\n")
                    .append("Type-specific instructions and schema:\n")
                    .append(renderedTemplate)
                    .append("\n");
        }

        return """
            Generate exam questions for the course material below.

            GENERAL REQUIREMENTS
            - Language: %s
            - Difficulty: %s
            - Additional context: %s
            - Source document:
            %s

            QUESTION TYPE REQUIREMENTS
            %s

            OUTPUT REQUIREMENTS
            - Return exactly one valid JSON array.
            - Return exactly the requested number of questions for each type.
            - Each question must include the correct questionType value.
            - Follow the existing schema for each question type exactly.
            - Preserve all required fields, options, and answerKey structures.
            - Do not invent fields that are not supported by the schema.
            - Do not wrap the response in Markdown fences.
            - Do not include any text outside the JSON array.
            - Do not generate duplicate questions.
            """.formatted(
                language,
                difficulty,
                context,
                docContent,
                instructions
        );
    }

    @Override
    @Transactional
    public List<QuestionDetailDto> saveAiQuestions(AiSaveRequest request, User currentUser) {
        AiUsageLog log = aiUsageLogRepository.findById(request.getLogId())
                .orElseThrow(() -> new ResourceNotFoundException("AI usage log not found"));

        if (!log.getUser().getUserId().equals(currentUser.getUserId()) ||
                log.getCourse() == null || !log.getCourse().getCourseId().equals(request.getCourseId()) ||
                !"QUESTION_GEN".equals(log.getPurpose()) ||
                !"SUCCESS".equals(log.getStatus()) ||
                log.getSavedAt() != null) {
            throw new ForbiddenException("Invalid, already saved, or unauthorized AI usage log");
        }

        log.setSavedAt(Instant.now());
        aiUsageLogRepository.save(log);

        List<QuestionDetailDto> savedQuestions = new ArrayList<>();
        for (QuestionCreateRequest qReq : request.getQuestions()) {
            qReq.setCourseId(request.getCourseId());
            if (request.getModuleId() != null) {
                qReq.setModuleId(request.getModuleId());
            }
            QuestionDetailDto dto = createQuestionInternal(qReq, currentUser, "AI", "MANAGER", "APPROVED");
            Question q = questionRepository.findById(dto.getQuestionId()).orElseThrow();
            q.setAiUsageLogId(log.getLogId());
            questionRepository.save(q);
            dto.setSource("AI");
            savedQuestions.add(dto);
        }
        return savedQuestions;
    }

    @Override
    @Transactional(readOnly = true)
    public byte[] generateExcelTemplate(Long courseId, User currentUser) {
        validateCourseAccess(courseId, currentUser);
        try (Workbook workbook = new XSSFWorkbook(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            String[] sheets = {"SINGLE_CHOICE", "MULTIPLE_CHOICE", "TRUE_FALSE", "MATCHING", "FILL_BLANK", "ESSAY"};
            for (String sheetName : sheets) {
                Sheet sheet = workbook.createSheet(sheetName);
                Row header = sheet.createRow(0);
                String[] headers = {"Module ID", "Difficulty", "Content", "Default Points", "Explanation", "Skill Tag", "Status",
                        "Option 1", "Option 2", "Option 3", "Option 4", "Correct 1", "Correct 2", "Correct 3", "Correct 4", "Answer Key / Rubric"};
                for (int i = 0; i < headers.length; i++) {
                    header.createCell(i).setCellValue(headers[i]);
                }
                Row example = sheet.createRow(1);
                example.createCell(0).setCellValue(1);
                example.createCell(1).setCellValue("MEDIUM");
                example.createCell(2).setCellValue("Sample question content?");
                example.createCell(3).setCellValue(1);
                example.createCell(4).setCellValue("Sample explanation");
                example.createCell(5).setCellValue("algebra");
                example.createCell(6).setCellValue("ACTIVE");
                example.createCell(7).setCellValue("Choice A");
                example.createCell(8).setCellValue("Choice B");
                example.createCell(9).setCellValue("Choice C");
                example.createCell(10).setCellValue("Choice D");
                example.createCell(11).setCellValue(true);
                example.createCell(12).setCellValue(false);
                example.createCell(13).setCellValue(false);
                example.createCell(14).setCellValue(false);
                example.createCell(15).setCellValue("");
            }
            workbook.write(out);
            return out.toByteArray();
        } catch (Exception e) {
            throw new BadRequestException("Failed to generate template: " + e.getMessage());
        }
    }

    @Override
    @Transactional
    public QuestionImportResult importExcel(Long courseId, MultipartFile file, boolean dryRun, User currentUser) {
        validateCourseAccess(courseId, currentUser);
        if (file.isEmpty() || file.getSize() > 5 * 1024 * 1024) {
            throw new BadRequestException("File is empty or exceeds 5MB limit");
        }
        String originalFilename = file.getOriginalFilename();
        if (originalFilename == null || !originalFilename.toLowerCase().endsWith(".xlsx")) {
            throw new BadRequestException("Only .xlsx files are supported");
        }

        List<QuestionImportResult.ImportRowError> errors = new ArrayList<>();
        List<QuestionCreateRequest> validRequests = new ArrayList<>();
        Set<String> fileHashes = new HashSet<>();
        int totalRows = 0;

        try (InputStream is = file.getInputStream(); Workbook workbook = new XSSFWorkbook(is)) {
            String[] sheets = {"SINGLE_CHOICE", "MULTIPLE_CHOICE", "TRUE_FALSE", "MATCHING", "FILL_BLANK", "ESSAY"};
            for (String sheetName : sheets) {
                Sheet sheet = workbook.getSheet(sheetName);
                if (sheet == null) continue;

                for (int r = 1; r <= sheet.getLastRowNum(); r++) {
                    Row row = sheet.getRow(r);
                    if (row == null || isRowEmpty(row)) continue;
                    totalRows++;
                    if (totalRows > 1000) {
                        throw new BadRequestException("Import exceeds maximum limit of 1000 rows");
                    }

                    try {
                        QuestionCreateRequest req = parseRowToRequest(sheetName, row, courseId);
                        QuestionPayload payload = QuestionPayload.from(req);
                        questionValidator.validateOrThrow(payload);

                        List<String> optTexts = req.getOptions() != null ?
                                req.getOptions().stream().map(o -> questionValidator.sanitize(o.getOptionText())).collect(Collectors.toList()) : null;
                        String akJson = serializeJson(req.getAnswerKey(), "answerKey");

                        String hash = ContentHashUtil.computeHash(req.getContent(), optTexts, akJson);
                        if (fileHashes.contains(hash)) {
                            errors.add(new QuestionImportResult.ImportRowError(sheetName, r + 1, "Duplicate content hash within import file"));
                            continue;
                        }

                        boolean dbConflict = questionRepository.findAll().stream()
                                .anyMatch(other -> other.getCourse() != null &&
                                        other.getCourse().getCourseId().equals(courseId) &&
                                        "ACTIVE".equals(other.getStatus()) &&
                                        other.getDeletedAt() == null &&
                                        hash.equals(other.getContentHash()));
                        if (dbConflict) {
                            errors.add(new QuestionImportResult.ImportRowError(sheetName, r + 1, "Content hash already exists in database"));
                            continue;
                        }

                        fileHashes.add(hash);
                        validRequests.add(req);
                    } catch (Exception e) {
                        errors.add(new QuestionImportResult.ImportRowError(sheetName, r + 1, e.getMessage()));
                    }
                }
            }
        } catch (Exception e) {
            throw new BadRequestException("Failed to parse Excel file: " + e.getMessage());
        }

        int savedCount = 0;
        if (!dryRun && errors.isEmpty()) {
            for (QuestionCreateRequest req : validRequests) {
                createQuestionInternal(req, currentUser, "IMPORT", "MANAGER", "APPROVED");
                savedCount++;
            }
        } else if (!dryRun) {
            for (QuestionCreateRequest req : validRequests) {
                try {
                    createQuestionInternal(req, currentUser, "IMPORT", "MANAGER", "APPROVED");
                    savedCount++;
                } catch (Exception ignored) {}
            }
        }

        return QuestionImportResult.builder()
                .saved(savedCount)
                .skipped(totalRows - savedCount)
                .errors(errors)
                .build();
    }

    @Override
    @Transactional(readOnly = true)
    public byte[] exportExcel(Long courseId, String questionType, String status, String difficulty, User currentUser) {
        validateCourseAccess(courseId, currentUser);
        Specification<Question> spec = (root, query, cb) -> {
            var predicate = cb.and(cb.equal(root.get("course").get("courseId"), courseId), cb.isNull(root.get("deletedAt")));
            if (questionType != null) predicate = cb.and(predicate, cb.equal(root.get("questionType"), questionType));
            if (status != null) predicate = cb.and(predicate, cb.equal(root.get("status"), status));
            if (difficulty != null) predicate = cb.and(predicate, cb.equal(root.get("difficulty"), difficulty));
            return predicate;
        };

        List<Question> questions = questionRepository.findAll(spec);

        try (Workbook workbook = new XSSFWorkbook(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            String[] sheets = {"SINGLE_CHOICE", "MULTIPLE_CHOICE", "TRUE_FALSE", "MATCHING", "FILL_BLANK", "ESSAY"};
            Map<String, List<Question>> grouped = questions.stream().collect(Collectors.groupingBy(Question::getQuestionType));

            for (String sheetName : sheets) {
                Sheet sheet = workbook.createSheet(sheetName);
                Row header = sheet.createRow(0);
                String[] headers = {"Module ID", "Difficulty", "Content", "Default Points", "Explanation", "Skill Tag", "Status",
                        "Option 1", "Option 2", "Option 3", "Option 4", "Correct 1", "Correct 2", "Correct 3", "Correct 4", "Answer Key / Rubric"};
                for (int i = 0; i < headers.length; i++) {
                    header.createCell(i).setCellValue(headers[i]);
                }

                List<Question> qList = grouped.getOrDefault(sheetName, Collections.emptyList());
                int r = 1;
                for (Question q : qList) {
                    Row row = sheet.createRow(r++);
                    if (q.getModule() != null) row.createCell(0).setCellValue(q.getModule().getModuleId());
                    row.createCell(1).setCellValue(safeExport(q.getDifficulty()));
                    row.createCell(2).setCellValue(safeExport(q.getContent()));
                    row.createCell(3).setCellValue(q.getDefaultPoints() != null ? q.getDefaultPoints().doubleValue() : 1.0);
                    row.createCell(4).setCellValue(safeExport(q.getAiExplanation()));

                    String skillTag = "";
                    try {
                        if (q.getQuestionMetadata() != null) {
                            Map map = objectMapper.readValue(q.getQuestionMetadata(), Map.class);
                            if (map.containsKey("skillTag")) skillTag = (String) map.get("skillTag");
                        }
                    } catch (Exception ignored) {}
                    row.createCell(5).setCellValue(safeExport(skillTag));
                    row.createCell(6).setCellValue(safeExport(q.getStatus()));

                    List<AnswerOption> opts = answerOptionRepository.findByQuestion_QuestionId(q.getQuestionId());
                    for (int o = 0; o < Math.min(opts.size(), 4); o++) {
                        row.createCell(7 + o).setCellValue(safeExport(opts.get(o).getOptionText()));
                        row.createCell(11 + o).setCellValue(Boolean.TRUE.equals(opts.get(o).getIsCorrect()));
                    }

                    String extra = q.getAnswerKey() != null ? q.getAnswerKey() : q.getEssayGradingRubric();
                    row.createCell(15).setCellValue(safeExport(extra));
                }
            }
            workbook.write(out);
            return out.toByteArray();
        } catch (Exception e) {
            throw new BadRequestException("Failed to export Excel: " + e.getMessage());
        }
    }

    private void validateCourseAccess(Long courseId, User currentUser) {
        if (!User.ROLE_ADMIN.equals(currentUser.getRoleName())) {
            boolean isManager = courseManagerRepository.existsByCourse_CourseIdAndUser_UserId(courseId, currentUser.getUserId());
            if (!isManager) {
                throw new ForbiddenException("You do not have access to this course");
            }
        }
    }

    private boolean isRowEmpty(Row row) {
        for (int c = 0; c < row.getLastCellNum(); c++) {
            Cell cell = row.getCell(c);
            if (cell != null && cell.getCellType() != CellType.BLANK) return false;
        }
        return true;
    }

    private QuestionCreateRequest parseRowToRequest(String sheetName, Row row, Long courseId) {
        Long moduleId = getCellLong(row.getCell(0));
        String difficulty = getCellString(row.getCell(1));
        String content = getCellString(row.getCell(2));
        double points = getCellDouble(row.getCell(3), 1.0);
        String explanation = getCellString(row.getCell(4));
        String skillTag = getCellString(row.getCell(5));
        String status = getCellString(row.getCell(6));

        List<AnswerOptionDto> options = new ArrayList<>();
        for (int o = 0; o < 4; o++) {
            String optText = getCellString(row.getCell(7 + o));
            if (optText != null && !optText.trim().isEmpty()) {
                boolean isCorrect = getCellBoolean(row.getCell(11 + o));
                options.add(AnswerOptionDto.builder()
                        .optionText(parseCellInput(optText))
                        .isCorrect(isCorrect)
                        .orderIndex(o)
                        .build());
            }
        }

        String extra = getCellString(row.getCell(15));
        Object answerKey = null;
        Object rubric = null;
        if (extra != null && !extra.trim().isEmpty()) {
            try {
                Object parsed = objectMapper.readValue(extra, Object.class);
                if ("MATCHING".equals(sheetName) || "FILL_BLANK".equals(sheetName)) {
                    answerKey = parsed;
                } else if ("ESSAY".equals(sheetName)) {
                    rubric = parsed;
                }
            } catch (Exception ignored) {}
        }

        Object metadata = null;
        if (skillTag != null && !skillTag.trim().isEmpty()) {
            metadata = Map.of("skillTag", parseCellInput(skillTag));
        }

        return QuestionCreateRequest.builder()
                .courseId(courseId)
                .moduleId(moduleId)
                .questionType(sheetName)
                .difficulty(difficulty != null ? difficulty : "MEDIUM")
                .content(parseCellInput(content))
                .defaultPoints(BigDecimal.valueOf(points))
                .explanation(parseCellInput(explanation))
                .status(status != null ? status : "ACTIVE")
                .questionMetadata(metadata)
                .answerKey(answerKey)
                .essayGradingRubric(rubric)
                .options(options)
                .build();
    }

    private String getCellString(Cell cell) {
        if (cell == null) return null;
        if (cell.getCellType() == CellType.STRING) return cell.getStringCellValue();
        if (cell.getCellType() == CellType.NUMERIC) return String.valueOf((long) cell.getNumericCellValue());
        if (cell.getCellType() == CellType.BOOLEAN) return String.valueOf(cell.getBooleanCellValue());
        return null;
    }

    private Long getCellLong(Cell cell) {
        if (cell == null) return null;
        if (cell.getCellType() == CellType.NUMERIC) return (long) cell.getNumericCellValue();
        try {
            String s = getCellString(cell);
            if (s != null) return Long.valueOf(s.trim());
        } catch (Exception ignored) {}
        return null;
    }

    private double getCellDouble(Cell cell, double def) {
        if (cell == null) return def;
        if (cell.getCellType() == CellType.NUMERIC) return cell.getNumericCellValue();
        try {
            String s = getCellString(cell);
            if (s != null) return Double.parseDouble(s.trim());
        } catch (Exception ignored) {}
        return def;
    }

    private boolean getCellBoolean(Cell cell) {
        if (cell == null) return false;
        if (cell.getCellType() == CellType.BOOLEAN) return cell.getBooleanCellValue();
        if (cell.getCellType() == CellType.STRING) {
            return Boolean.parseBoolean(cell.getStringCellValue().trim());
        }
        return false;
    }

    private String safeExport(String text) {
        if (text == null) return "";
        if (text.startsWith("=") || text.startsWith("+") || text.startsWith("-") || text.startsWith("@")) {
            return "'" + text;
        }
        return text;
    }

    private String parseCellInput(String text) {
        if (text != null && text.startsWith("'") && text.length() > 1) {
            return text.substring(1);
        }
        return text;
    }

    private String loadPromptTemplate(String questionType) {
        String fileName = questionType.toLowerCase() + ".txt";
        try {
            ClassPathResource resource = new ClassPathResource("prompts/" + fileName);
            byte[] bytes = FileCopyUtils.copyToByteArray(resource.getInputStream());
            return new String(bytes, StandardCharsets.UTF_8);
        } catch (Exception e) {
            return "Generate {count} questions of type {questionType} in {language} for difficulty {difficulty}.\nContext: {context}\nDocument: {document}";
        }
    }

    private List<QuestionCreateRequest> parseAiJson(String jsonText) {
        if (jsonText == null || jsonText.trim().isEmpty()) return Collections.emptyList();
        try {
            String cleaned = jsonText.trim();
            if (cleaned.startsWith("```json")) {
                cleaned = cleaned.substring(7);
            } else if (cleaned.startsWith("```")) {
                cleaned = cleaned.substring(3);
            }
            if (cleaned.endsWith("```")) {
                cleaned = cleaned.substring(0, cleaned.length() - 3);
            }
            return objectMapper.readValue(cleaned.trim(), new TypeReference<List<QuestionCreateRequest>>() {});
        } catch (Exception e) {
            return Collections.emptyList();
        }
    }

    private QuestionDetailDto mapToDetailDto(Question q, List<AnswerOption> options) {
        Object metadataObj = parseJson(q.getQuestionMetadata());
        Object answerKeyObj = parseJson(q.getAnswerKey());
        Object rubricObj = parseJson(q.getEssayGradingRubric());

        List<AnswerOptionDto> optDtos = options.stream().map(o -> AnswerOptionDto.builder()
                .optionId(o.getOptionId())
                .optionText(o.getOptionText())
                .isCorrect(o.getIsCorrect())
                .explanation(o.getExplanation())
                .orderIndex(o.getOrderIndex())
                .build()).collect(Collectors.toList());

        return QuestionDetailDto.builder()
                .questionId(q.getQuestionId())
                .courseId(q.getCourse() != null ? q.getCourse().getCourseId() : null)
                .moduleId(q.getModule() != null ? q.getModule().getModuleId() : null)
                .groupId(q.getGroup() != null ? q.getGroup().getGroupId() : null)
                .questionType(q.getQuestionType())
                .difficulty(q.getDifficulty())
                .content(q.getContent())
                .questionMetadata(metadataObj)
                .answerKey(answerKeyObj)
                .defaultPoints(q.getDefaultPoints())
                .source(q.getSource())
                .creatorRole(q.getCreatorRole())
                .createdBy(q.getCreatedBy() != null ? q.getCreatedBy().getUserId() : null)
                .scoringVersion(q.getScoringVersion())
                .lockVersion(q.getLockVersion())
                .aiExplanation(q.getAiExplanation())
                .status(q.getStatus())
                .approvalStatus(q.getApprovalStatus())
                .essayGradingRubric(rubricObj)
                .options(optDtos)
                .createdAt(q.getCreatedAt())
                .updatedAt(q.getUpdatedAt())
                .build();
    }

    private Object parseJson(String jsonStr) {
        if (jsonStr == null || jsonStr.trim().isEmpty()) return null;
        try {
            return objectMapper.readValue(jsonStr, Object.class);
        } catch (Exception e) {
            return null;
        }
    }

    private String serializeJson(Object obj, String fieldName) {
        if (obj == null) return null;
        try {
            return objectMapper.writeValueAsString(obj);
        } catch (Exception e) {
            throw new BadRequestException("Failed to serialize " + fieldName + ": " + e.getMessage());
        }
    }

    private void validateMetadataKeys(Object metadata) {
        if (metadata == null) return;
        try {
            Map<String, Object> map;
            if (metadata instanceof Map) {
                map = (Map<String, Object>) metadata;
            } else {
                map = objectMapper.convertValue(metadata, Map.class);
            }
            for (String key : map.keySet()) {
                if (!key.equals("skillTag") && !key.equals("diagramType") && !key.equals("plantUmlSource")) {
                    throw new BadRequestException("Unknown metadata key: " + key);
                }
                if (key.equals("skillTag")) {
                    Object val = map.get(key);
                    if (val != null && (val.toString().length() > 100 || val.toString().trim().isEmpty())) {
                        throw new BadRequestException("skillTag must be a non-empty string up to 100 characters");
                    }
                }
            }
        } catch (BadRequestException e) {
            throw e;
        } catch (Exception e) {
            throw new BadRequestException("Invalid question metadata format");
        }
    }

    private void checkContentHashConflict(Long courseId, String contentHash, Long excludeQuestionId) {
        if (courseId == null || contentHash == null) return;
        List<Question> existing = questionRepository.findAll().stream()
                .filter(q -> q.getCourse() != null && q.getCourse().getCourseId().equals(courseId))
                .filter(q -> q.getDeletedAt() == null)
                .filter(q -> contentHash.equals(q.getContentHash()))
                .filter(q -> excludeQuestionId == null || !q.getQuestionId().equals(excludeQuestionId))
                .toList();
        if (!existing.isEmpty()) {
            throw new ResourceConflictException("Duplicate content hash with question id: " + existing.get(0).getQuestionId());
        }
    }
}
