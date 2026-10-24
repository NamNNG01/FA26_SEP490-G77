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
import com.examprep.util.QuestionTypeUtil;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.core.io.ClassPathResource;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
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


    public Page<QuestionListItemDto> getQuestions(Long courseId, List<Long> courseIds, Long moduleId, Long groupId, String groupType, String questionType, List<String> questionTypes, String difficulty, String status, String approvalStatus, String creatorRole, String source, Long createdBy, String search, Pageable pageable, User currentUser) {
        List<Long> scopeCourseIds = courseIds == null ? List.of() : courseIds.stream().filter(Objects::nonNull).distinct().toList();

        if (!User.ROLE_ADMIN.equals(currentUser.getRoleName())) {
            List<Long> requested = new ArrayList<>(scopeCourseIds);
            if (courseId != null) requested.add(courseId);
            for (Long id : requested.stream().distinct().toList()) {
                if (!courseManagerRepository.existsByCourse_CourseIdAndUser_UserId(id, currentUser.getUserId())) {
                    throw new ForbiddenException("You do not have access to this course");
                }
            }
        }

        Specification<Question> spec = (root, query, cb) -> {
            var predicate = cb.isNull(root.get("deletedAt"));
            if (courseId != null) predicate = cb.and(predicate, cb.equal(root.get("course").get("courseId"), courseId));
            if (!scopeCourseIds.isEmpty()) predicate = cb.and(predicate, root.get("course").get("courseId").in(scopeCourseIds));
            if (moduleId != null) predicate = cb.and(predicate, cb.equal(root.get("module").get("moduleId"), moduleId));
            if (groupId != null) predicate = cb.and(predicate, cb.equal(root.get("group").get("groupId"), groupId));

            if (groupType != null && !groupType.isBlank()) {
                if ("NONE".equalsIgnoreCase(groupType)) {
                    predicate = cb.and(predicate, cb.isNull(root.get("group")));
                } else {
                    String kind = QuestionTypeUtil.requireKind(groupType.trim().toUpperCase(Locale.ROOT));
                    var group = root.join("group");
                    predicate = cb.and(predicate, cb.equal(group.get("questionType"), kind));
                }
            }

            if (questionType != null) predicate = cb.and(predicate, cb.equal(root.get("questionType"), questionType));

            if (questionTypes != null && !questionTypes.isEmpty()) {
                List<String> normalizedTypes = questionTypes.stream().filter(Objects::nonNull).map(type -> type.trim().toUpperCase(Locale.ROOT)).filter(type -> !type.isEmpty()).distinct().toList();
                if (!normalizedTypes.isEmpty()) predicate = cb.and(predicate, root.get("questionType").in(normalizedTypes));
            }

            if (difficulty != null) predicate = cb.and(predicate, cb.equal(root.get("difficulty"), difficulty));
            if (status != null) predicate = cb.and(predicate, cb.equal(root.get("status"), status));
            if (approvalStatus != null) predicate = cb.and(predicate, cb.equal(root.get("approvalStatus"), approvalStatus));
            if (creatorRole != null) predicate = cb.and(predicate, cb.equal(root.get("creatorRole"), creatorRole));
            if (source != null) predicate = cb.and(predicate, cb.equal(root.get("source"), source));
            if (createdBy != null) predicate = cb.and(predicate, cb.equal(root.get("createdBy").get("userId"), createdBy));

            if (search != null && !search.trim().isEmpty()) {
                String keyword = "%" + search.trim().toLowerCase(Locale.ROOT) + "%";
                predicate = cb.and(predicate, cb.like(cb.lower(root.get("content")), keyword));
            }

            return predicate;
        };

        Page<Question> page = questionRepository.findAll(spec, pageable);
        List<Long> questionIds = page.getContent().stream().map(Question::getQuestionId).toList();
        Map<Long, Long> optionCountMap = new HashMap<>();

        if (!questionIds.isEmpty()) {
            List<Object[]> rows = questionRepository.countOptionsByQuestionIds(questionIds);
            for (Object[] row : rows) optionCountMap.put(((Number) row[0]).longValue(), ((Number) row[1]).longValue());
        }

        return page.map(q -> QuestionListItemDto.builder()
                .questionId(q.getQuestionId()).content(q.getContent())
                .courseId(q.getCourse() != null ? q.getCourse().getCourseId() : null)
                .courseName(q.getCourse() != null ? q.getCourse().getTitle() : null)
                .moduleId(q.getModule() != null ? q.getModule().getModuleId() : null)
                .moduleName(q.getModule() != null ? q.getModule().getTitle() : null)
                .groupId(q.getGroup() != null ? q.getGroup().getGroupId() : null)
                .questionType(q.getQuestionType()).difficulty(q.getDifficulty())
                .status(q.getStatus()).approvalStatus(q.getApprovalStatus())
                .creatorRole(q.getCreatorRole()).source(q.getSource())
                .createdBy(q.getCreatedBy() != null ? q.getCreatedBy().getUserId() : null)
                .scoringVersion(q.getScoringVersion()).lockVersion(q.getLockVersion())
                .optionCount(Math.toIntExact(optionCountMap.getOrDefault(q.getQuestionId(), 0L)))
                .updatedAt(q.getUpdatedAt()).build());
    }



    @Override
    @Transactional
    public List<QuestionDetailDto> createQuestionsBatch(Long courseId, Long moduleId, List<QuestionCreateRequest> requests, User currentUser) {
        if (requests == null || requests.isEmpty() || requests.size() > 50) throw new BadRequestException("Batch size must be between 1 and 50");
        if (courseId == null || moduleId == null) throw new BadRequestException("Course ID and Module ID are required");

        List<ValidationError> errors = new ArrayList<>();
        for (int i = 0; i < requests.size(); i++) {
            QuestionCreateRequest req = requests.get(i);
            req.setCourseId(courseId);
            req.setModuleId(moduleId);
            errors.addAll(questionValidator.validate(QuestionPayload.from(req), "questions[" + i + "]."));
        }
        if (!errors.isEmpty()) throw new QuestionValidationException(errors);

        Course course = courseRepository.findById(courseId)
                .orElseThrow(() -> new ResourceNotFoundException("Course not found"));

        if (!User.ROLE_ADMIN.equals(currentUser.getRoleName())) {
            boolean isManager = courseManagerRepository.existsByCourse_CourseIdAndUser_UserId(
                    course.getCourseId(), currentUser.getUserId());
            if (!isManager) {
                throw new ForbiddenException("You are not a manager of this course");
            }
        }

        com.examprep.entities.Module module = moduleRepository.findById(moduleId)
                .orElseThrow(() -> new ResourceNotFoundException("Module not found"));

        if (!module.getCourse().getCourseId().equals(course.getCourseId())) {
            throw new BadRequestException("Module does not belong to the specified course");
        }

        List<String> hashes = new ArrayList<>(requests.size());
        Set<String> seenHashes = new HashSet<>();
        List<String> duplicateIndexes = new ArrayList<>();

        for (int i = 0; i < requests.size(); i++) {
            QuestionCreateRequest req = requests.get(i);
            validateMetadataKeys(req.getQuestionMetadata());

            if (req.getGroupId() != null) {
                QuestionGroup group = questionGroupRepository.findById(req.getGroupId())
                        .orElseThrow(() -> new ResourceNotFoundException("Question group not found"));
                if (group.getCourse() == null || !group.getCourse().getCourseId().equals(course.getCourseId())) {
                    throw new BadRequestException("Question group does not belong to the specified course");
                }
                if (group.getModule() != null && !group.getModule().getModuleId().equals(moduleId)) {
                    throw new BadRequestException("Question group does not belong to the specified module");
                }
                assertQuestionFitsGroup(group, req.getQuestionType());
            }

            String hash = contentHash(req);

            hashes.add(hash);
            if (!seenHashes.add(hash)) duplicateIndexes.add(String.valueOf(i + 1));
        }

        if (!duplicateIndexes.isEmpty()) throw new ResourceConflictException("Duplicate questions in request at index: " + String.join(", ", duplicateIndexes));

        Set<String> existingHashes = questionRepository.findExistingContentHashes(courseId, new HashSet<>(hashes));
        if (!existingHashes.isEmpty()) {
            List<String> existingIndexes = new ArrayList<>();
            for (int i = 0; i < hashes.size(); i++) {
                if (existingHashes.contains(hashes.get(i))) existingIndexes.add(String.valueOf(i + 1));
            }
            throw new ResourceConflictException("Questions already exist in course at index: " + String.join(", ", existingIndexes));
        }

        List<Question> questionsToSave = new ArrayList<>(requests.size());
        List<List<AnswerOptionDto>> reqOptionsList = new ArrayList<>(requests.size());
        List<Boolean> isOrderingList = new ArrayList<>(requests.size());
        List<List<Object>> correctOrderList = new ArrayList<>(requests.size());

        for (int i = 0; i < requests.size(); i++) {
            QuestionCreateRequest req = requests.get(i);
            String source = "MANUAL";
            String creatorRole = "MANAGER";
            String approvalStatus = "APPROVED";
            String status = req.getStatus() != null ? req.getStatus() : "ACTIVE";

            QuestionGroup group = null;
            if (req.getGroupId() != null) {
                group = questionGroupRepository.findById(req.getGroupId()).orElse(null);
            }

            String metadataJson = serializeJson(req.getQuestionMetadata(), "questionMetadata");
            String answerKeyJson = serializeJson(req.getAnswerKey(), "answerKey");
            String rubricJson = serializeJson(req.getEssayGradingRubric(), "essayGradingRubric");

            boolean isOrdering = "ORDERING".equals(req.getQuestionType());
            List<Object> correctOrder = null;
            if (isOrdering) {
                correctOrder = req.getCorrectOrder();
                if (correctOrder == null && req.getAnswerKey() instanceof Map<?, ?> map && map.get("correctOrder") instanceof List<?> list) {
                    correctOrder = new ArrayList<>(list);
                }
            }

            Question question = Question.builder()
                    .course(course)
                    .module(module)
                    .group(group)
                    .createdBy(currentUser)
                    .questionType(req.getQuestionType())
                    .difficulty(req.getDifficulty() != null ? req.getDifficulty() : "MEDIUM")
                    .content(req.getContent())
                    .questionMetadata(metadataJson)
                    .answerKey(answerKeyJson)
                    .source(source)
                    .creatorRole(creatorRole)
                    .approvalStatus(approvalStatus)
                    .status(status)
                    .aiExplanation(req.getExplanation())
                    .essayGradingRubric(rubricJson)
                    .contentHash(hashes.get(i))
                    .scoringVersion(1)
                    .lockVersion(0L)
                    .build();

            questionsToSave.add(question);
            reqOptionsList.add(req.getOptions());
            isOrderingList.add(isOrdering);
            correctOrderList.add(correctOrder);
        }

        List<Question> savedQuestions = questionRepository.saveAll(questionsToSave);

        List<AnswerOption> allOptionsToSave = new ArrayList<>();
        Map<Question, List<AnswerOption>> questionToSavedOptions = new HashMap<>();

        for (int i = 0; i < savedQuestions.size(); i++) {
            Question q = savedQuestions.get(i);
            List<AnswerOptionDto> optDtos = reqOptionsList.get(i);
            boolean isOrdering = isOrderingList.get(i);
            List<AnswerOption> qOptions = new ArrayList<>();

            if (optDtos != null) {
                for (int j = 0; j < optDtos.size(); j++) {
                    AnswerOptionDto optDto = optDtos.get(j);
                    AnswerOption opt = AnswerOption.builder()
                            .question(q)
                            .optionText(optDto.getOptionText())
                            .isCorrect(isOrdering ? false : (optDto.getIsCorrect() != null ? optDto.getIsCorrect() : false))
                            .explanation(optDto.getExplanation())
                            .orderIndex(optDto.getOrderIndex() != null ? optDto.getOrderIndex() : j)
                            .build();
                    qOptions.add(opt);
                    allOptionsToSave.add(opt);
                }
            }
            questionToSavedOptions.put(q, qOptions);
        }

        List<AnswerOption> savedOptionsAll = answerOptionRepository.saveAll(allOptionsToSave);

        List<QuestionDetailDto> results = new ArrayList<>(savedQuestions.size());
        for (int i = 0; i < savedQuestions.size(); i++) {
            Question q = savedQuestions.get(i);
            boolean isOrdering = isOrderingList.get(i);
            List<Object> correctOrder = correctOrderList.get(i);
            List<AnswerOptionDto> optDtos = reqOptionsList.get(i);
            List<AnswerOption> qOptions = questionToSavedOptions.get(q);

            if (isOrdering && optDtos != null) {
                Map<String, Long> keyToIdMap = new HashMap<>();
                for (int j = 0; j < optDtos.size(); j++) {
                    AnswerOptionDto dto = optDtos.get(j);
                    String key = dto.getKey() != null ? dto.getKey() : String.valueOf(j);
                    Long optionId = qOptions.get(j).getOptionId();
                    keyToIdMap.put(key, optionId);
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
                            throw new BadRequestException("Invalid option in correct order: " + itemStr);
                        }
                        orderedOptionIds.add(optionId);
                    }
                }

                String finalAnswerKeyJson = serializeJson(Map.of("correctOrder", orderedOptionIds), "answerKey");
                q.setAnswerKey(finalAnswerKeyJson);
                q = questionRepository.save(q);
            }

            results.add(mapToDetailDto(q, qOptions));
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
        if (req.getModuleId() != null) {
            com.examprep.entities.Module module = moduleRepository.findById(req.getModuleId())
                    .orElseThrow(() -> new ResourceNotFoundException("Module not found"));

            if (q.getCourse() == null
                    || !module.getCourse().getCourseId().equals(q.getCourse().getCourseId())) {
                throw new BadRequestException(
                        "Module does not belong to the question's course"
                );
            }

            q.setModule(module);
        } else if (q.getModule() == null) {
            throw new BadRequestException("Module ID is required");
        }
        if (req.getGroupId() == null) {
            q.setGroup(null);
        } else {
            QuestionGroup group = questionGroupRepository.findById(req.getGroupId())
                    .orElseThrow(() -> new ResourceNotFoundException("Question group not found"));

            if (q.getCourse() != null
                    && (group.getCourse() == null
                    || !q.getCourse().getCourseId().equals(group.getCourse().getCourseId()))) {
                throw new ResourceConflictException("Question group must belong to the same course");
            }

            if (q.getModule() != null
                    && (group.getModule() == null
                    || !q.getModule().getModuleId().equals(group.getModule().getModuleId()))) {
                throw new ResourceConflictException("Question group must belong to the same module");
            }

            q.setGroup(group);
        }
        if (req.getLockVersion() != null && !req.getLockVersion().equals(q.getLockVersion())) {
            throw new ResourceConflictException("Resource was modified by another user (lock version mismatch)");
        }

        QuestionGroup targetGroup = q.getGroup();
        if (req.getGroupId() != null) {
            targetGroup = questionGroupRepository.findById(req.getGroupId())
                    .orElseThrow(() -> new ResourceNotFoundException("Question group not found"));

            Long questionCourseId = q.getCourse() == null ? null : q.getCourse().getCourseId();
            Long groupCourseId = targetGroup.getCourse() == null ? null : targetGroup.getCourse().getCourseId();
            if (questionCourseId == null || groupCourseId == null || !questionCourseId.equals(groupCourseId)) {
                throw new BadRequestException("Question group does not belong to the specified course");
            }
            if (q.getModule() != null && targetGroup.getModule() != null
                    && !targetGroup.getModule().getModuleId().equals(q.getModule().getModuleId())) {
                throw new BadRequestException("Question group does not belong to the specified module");
            }
        }

        String typeToValidate = req.getQuestionType() != null ? req.getQuestionType() : q.getQuestionType();
        boolean attachingToAnotherGroup = req.getGroupId() != null
                && (q.getGroup() == null || !req.getGroupId().equals(q.getGroup().getGroupId()));
        boolean changingType = req.getQuestionType() != null
                && !req.getQuestionType().equals(q.getQuestionType());
        if (targetGroup != null && (attachingToAnotherGroup || changingType)) {
            assertQuestionFitsGroup(targetGroup, typeToValidate);
        }

        if (req.getQuestionType() != null && !req.getQuestionType().equals(q.getQuestionType())) {
            if (attemptAnswerRepository.existsByQuestion_QuestionId(q.getQuestionId())) {
                throw new ResourceConflictException("Cannot change question type when student attempts reference this question");
            }
            questionValidator.validateQuestionType(req.getQuestionType());
            q.setQuestionType(req.getQuestionType());
        }

        if (req.getGroupId() != null) {
            q.setGroup(targetGroup);
        }

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
        String contentToValidate = req.getContent() != null ? req.getContent() : q.getContent();
        String difficultyToValidate = req.getDifficulty() != null ? req.getDifficulty() : q.getDifficulty();
        String statusToValidate = req.getStatus() != null ? req.getStatus() : q.getStatus();

        QuestionPayload payload = QuestionPayload.builder()
                .questionType(typeToValidate)
                .difficulty(difficultyToValidate)
                .status(statusToValidate)
                .content(contentToValidate)
                .questionMetadata(metadataToValidate)
                .answerKey(answerKeyToValidate)
                .essayGradingRubric(rubricToValidate)
                .options(optionsToValidate)
                .build();

        questionValidator.validateOrThrow(payload);

        boolean scoreAffectingChanged = false;

        if (req.getContent() != null) {
            q.setContent(req.getContent());
        }
        if (req.getDifficulty() != null) q.setDifficulty(req.getDifficulty());
        if (req.getStatus() != null) q.setStatus(req.getStatus());
        if (req.getExplanation() != null) {
            q.setAiExplanation(req.getExplanation());
        }

        if (req.getQuestionMetadata() != null) {
            validateMetadataKeys(req.getQuestionMetadata());
            String metaJson = serializeJson(req.getQuestionMetadata(), "questionMetadata");
            if (!metaJson.equals(q.getQuestionMetadata())) {
                if ("DIAGRAM".equals(typeToValidate) && diagramXmlChanged(q.getQuestionMetadata(), metaJson)) {
                    scoreAffectingChanged = true;
                }
                q.setQuestionMetadata(metaJson);
            }
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
                if (rubricWeightsChanged(q.getEssayGradingRubric(), rubricJson)) {
                    scoreAffectingChanged = true;
                }
                q.setEssayGradingRubric(rubricJson);
            }
        }

        boolean isOrdering = "ORDERING".equals(typeToValidate);
        List<Long> oldCorrectOrder = new ArrayList<>();
        if (isOrdering && q.getAnswerKey() != null) {
            try {
                Map<String, Object> akMap = objectMapper.readValue(q.getAnswerKey(), Map.class);
                if (akMap.get("correctOrder") instanceof List) {
                    oldCorrectOrder = ((List<?>) akMap.get("correctOrder")).stream()
                            .map(idObj -> Long.parseLong(idObj.toString()))
                            .collect(Collectors.toList());
                }
            } catch (Exception ignored) {}
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
                    String text = dto.getOptionText();
                    boolean correct = dto.getIsCorrect() != null ? dto.getIsCorrect() : false;
                    if (!isOrdering) {
                        if (!opt.getOptionText().equals(text) || !opt.getIsCorrect().equals(correct)) {
                            scoreAffectingChanged = true;
                        }
                    } else {
                        if (!opt.getOptionText().equals(text)) {
                            // scoring_version does not increase when only optionText changes for ORDERING
                        }
                    }
                    opt.setOptionText(text);
                    opt.setIsCorrect(isOrdering ? false : correct);
                    opt.setExplanation(dto.getExplanation());
                    opt.setOrderIndex(dto.getOrderIndex() != null ? dto.getOrderIndex() : i);
                    updatedOptions.add(opt);
                } else {
                    AnswerOption opt = AnswerOption.builder()
                            .question(q)
                            .optionText(dto.getOptionText())
                            .isCorrect(false)
                            .explanation(dto.getExplanation())
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

        if (isOrdering) {
            Map<String, Long> keyToIdMap = new HashMap<>();
            for (int i = 0; i < req.getOptions().size(); i++) {
                AnswerOptionDto dto = req.getOptions().get(i);
                String k = dto.getKey() != null ? dto.getKey() : (dto.getOptionId() != null ? String.valueOf(dto.getOptionId()) : String.valueOf(i));
                AnswerOption matchedOpt = null;
                if (dto.getOptionId() != null) {
                    matchedOpt = updatedOptions.stream().filter(o -> o.getOptionId().equals(dto.getOptionId())).findFirst().orElse(null);
                } else if (i < updatedOptions.size()) {
                    matchedOpt = updatedOptions.get(i);
                }
                if (matchedOpt != null) {
                    keyToIdMap.put(k, matchedOpt.getOptionId());
                    keyToIdMap.put(String.valueOf(matchedOpt.getOptionId()), matchedOpt.getOptionId());
                }
            }

            List<Object> coList = req.getCorrectOrder();
            if (coList == null && req.getAnswerKey() instanceof Map) {
                Object coObj = ((Map<?, ?>) req.getAnswerKey()).get("correctOrder");
                if (coObj instanceof List) {
                    coList = (List<Object>) coObj;
                }
            }

            List<Long> newCorrectOrder = new ArrayList<>();
            List<String> orderedOptionTexts = new ArrayList<>();
            if (coList != null) {
                for (Object item : coList) {
                    String itemStr = item != null ? item.toString() : "";
                    Long optId = keyToIdMap.get(itemStr);
                    if (optId == null) {
                        try {
                            optId = Long.parseLong(itemStr);
                        } catch (Exception ignored) {}
                    }
                    if (optId != null) {
                        newCorrectOrder.add(optId);
                        final Long targetId = optId;
                        updatedOptions.stream().filter(o -> o.getOptionId().equals(targetId)).findFirst()
                                .ifPresent(o -> orderedOptionTexts.add(o.getOptionText()));
                    }
                }
            }

            if (!newCorrectOrder.equals(oldCorrectOrder)) {
                scoreAffectingChanged = true;
            }

            String akJson = serializeJson(Map.of("correctOrder", newCorrectOrder), "answerKey");
            q.setAnswerKey(akJson);

            if (scoreAffectingChanged) {
                q.setScoringVersion(q.getScoringVersion() + 1);
            }

            String newHash = ContentHashUtil.computeOrderingHash(contentToValidate, orderedOptionTexts);
            q.setContentHash(newHash);
        } else {
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
            if (scoreAffectingChanged) {
                q.setScoringVersion(q.getScoringVersion() + 1);
            }
            List<String> optionTexts = updatedOptions.stream().map(AnswerOption::getOptionText).collect(Collectors.toList());
            String newHash = ContentHashUtil.computeHash(q.getContent(), optionTexts, q.getAnswerKey());
            q.setContentHash(newHash);
        }

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
        Map<Long, Long> oldToNewIdMap = new HashMap<>();
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
        for (int i = 0; i < originalOptions.size(); i++) {
            oldToNewIdMap.put(originalOptions.get(i).getOptionId(), copiedOptions.get(i).getOptionId());
        }

        if (original.getAnswerKey() != null) {
            try {
                Map<String, Object> akMap = objectMapper.readValue(original.getAnswerKey(), Map.class);
                if (akMap.containsKey("correctOrder")) {
                    List<?> coList = (List<?>) akMap.get("correctOrder");
                    List<Long> remappedCo = new ArrayList<>();
                    for (Object idObj : coList) {
                        Long oldId = Long.parseLong(idObj.toString());
                        Long newId = oldToNewIdMap.get(oldId);
                        if (newId != null) {
                            remappedCo.add(newId);
                        }
                    }
                    akMap.put("correctOrder", remappedCo);
                    copy.setAnswerKey(objectMapper.writeValueAsString(akMap));
                    copy = questionRepository.save(copy);
                }
            } catch (Exception ignored) {}
        }

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

        }

        q.setStatus(newStatus);
        q = questionRepository.save(q);
        List<AnswerOption> options = answerOptionRepository.findByQuestion_QuestionId(q.getQuestionId());
        return mapToDetailDto(q, options);
    }

    private QuestionDetailDto mapToDetailDto(Question q, List<AnswerOption> options) {
        Object metadataObj = parseJson(q.getQuestionMetadata());
        Object answerKeyObj = parseJson(q.getAnswerKey());
        Object rubricObj = parseJson(q.getEssayGradingRubric());

        boolean isOrdering = "ORDERING".equals(q.getQuestionType());
        List<AnswerOptionDto> optDtos = options.stream().map(o -> AnswerOptionDto.builder()
                .optionId(o.getOptionId())
                .optionText(o.getOptionText())
                .isCorrect(isOrdering ? null : o.getIsCorrect())
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

    @Override
    public String contentHash(QuestionCreateRequest req) {
        List<String> optionTexts = req.getOptions() == null ? null : req.getOptions().stream().map(AnswerOptionDto::getOptionText).collect(Collectors.toList());
        String answerKeyJson = serializeJson(req.getAnswerKey(), "answerKey");
        if ("ORDERING".equals(req.getQuestionType())) {
            List<Object> correctOrder = req.getCorrectOrder();
            if (correctOrder == null && req.getAnswerKey() instanceof Map<?, ?> map && map.get("correctOrder") instanceof List<?> list) correctOrder = new ArrayList<>(list);

            Map<String, String> keyToText = new HashMap<>();
            if (req.getOptions() != null) {
                for (int j = 0; j < req.getOptions().size(); j++) {
                    AnswerOptionDto option = req.getOptions().get(j);
                    keyToText.put(option.getKey() != null ? option.getKey() : String.valueOf(j), option.getOptionText());
                }
            }

            List<String> orderedTexts = new ArrayList<>();
            if (correctOrder != null) {
                for (Object item : correctOrder) {
                    String key = item == null ? "" : item.toString();
                    String text = keyToText.get(key);
                    if (text == null) throw new BadRequestException("Invalid key in correct order: " + key);
                    orderedTexts.add(text);
                }
            }
            return ContentHashUtil.computeOrderingHash(req.getContent(), orderedTexts);
        } else {
            return ContentHashUtil.computeHash(req.getContent(), optionTexts, answerKeyJson);
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


    private void assertQuestionFitsGroup(QuestionGroup group, String questionType) {
        String kind = QuestionTypeUtil.kindOf(questionType);
        if (kind == null) {
            throw new BadRequestException("Unsupported question type: " + questionType);
        }

        String groupType = group.getQuestionType();
        if (groupType != null) {
            if (!groupType.equals(kind)) {
                throw new BadRequestException("Question type " + questionType
                        + " cannot be added to a group of type " + groupType + ".");
            }
            return;
        }

        Set<String> memberTypes = questionRepository.findDistinctQuestionTypesByGroupId(group.getGroupId()).stream()
                .map(QuestionTypeUtil::kindOf)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());
        if (memberTypes.isEmpty() || (memberTypes.size() == 1 && memberTypes.contains(kind))) {
            group.setQuestionType(kind);
            questionGroupRepository.save(group);
            return;
        }

        throw new ResourceConflictException(
                "Question group contains mixed question types; assign a single type before adding more questions.");
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
                if (!key.equals("diagramType")
                        && !key.equals("plantUmlSource")
                        && !key.equals("drawioXml")) {
                    throw new BadRequestException("Unknown metadata key: " + key);
                }
            }
        } catch (BadRequestException e) {
            throw e;
        } catch (Exception e) {
            throw new BadRequestException("Invalid question metadata format");
        }
    }

    private boolean rubricWeightsChanged(String oldRubricJson, String newRubricJson) {
        try {
            Map<String, Object> oldMap = oldRubricJson != null ? objectMapper.readValue(oldRubricJson, new TypeReference<Map<String, Object>>() {}) : new HashMap<>();
            Map<String, Object> newMap = newRubricJson != null ? objectMapper.readValue(newRubricJson, new TypeReference<Map<String, Object>>() {}) : new HashMap<>();
            List<?> oldCrit = (List<?>) oldMap.get("criteria");
            List<?> newCrit = (List<?>) newMap.get("criteria");
            if (oldCrit == null || newCrit == null || oldCrit.size() != newCrit.size()) return true;
            for (int i = 0; i < oldCrit.size(); i++) {
                Map<String, Object> oMap = (Map<String, Object>) oldCrit.get(i);
                Map<String, Object> nMap = (Map<String, Object>) newCrit.get(i);
                BigDecimal ow = new BigDecimal(oMap.getOrDefault("weight", oMap.getOrDefault("maxScore", "0")).toString());
                BigDecimal nw = new BigDecimal(nMap.getOrDefault("weight", nMap.getOrDefault("maxScore", "0")).toString());
                if (ow.compareTo(nw) != 0) return true;
            }
            return false;
        } catch (Exception e) {
            return true;
        }
    }

    private boolean diagramXmlChanged(String oldMetaJson, String newMetaJson) {
        try {
            Map<String, Object> oldMap = oldMetaJson != null ? objectMapper.readValue(oldMetaJson, new TypeReference<Map<String, Object>>() {}) : new HashMap<>();
            Map<String, Object> newMap = newMetaJson != null ? objectMapper.readValue(newMetaJson, new TypeReference<Map<String, Object>>() {}) : new HashMap<>();
            String oldXml = (String) oldMap.get("drawioXml");
            String newXml = (String) newMap.get("drawioXml");
            return !Objects.equals(oldXml, newXml);
        } catch (Exception e) {
            return true;
        }
    }



}
