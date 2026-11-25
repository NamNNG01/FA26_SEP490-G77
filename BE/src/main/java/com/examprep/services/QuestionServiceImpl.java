package com.examprep.services;

import com.examprep.ai.AiClient;
import com.examprep.dto.QuestionGroupResponse;
import com.examprep.dto.question.*;
import com.examprep.entities.*;
import com.examprep.entities.Module;
import com.examprep.exceptions.BadRequestException;
import com.examprep.exceptions.ForbiddenException;
import com.examprep.exceptions.QuestionValidationException;
import com.examprep.exceptions.ResourceConflictException;
import com.examprep.exceptions.ResourceNotFoundException;
import com.examprep.repositories.*;
import com.examprep.security.QuestionAccessPolicy;
import com.examprep.util.validation.QuestionPayload;
import com.examprep.util.validation.QuestionValidator;
import com.examprep.util.validation.ValidationError;
import com.examprep.util.ContentHashUtil;
import com.examprep.util.QuestionTypeUtil;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.EntityManager;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
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
    private final ExamGroupRepository examGroupRepository;
    private final ExamConfigRepository examConfigRepository;
    private final EntityManager entityManager;
    private final AttemptAnswerRepository attemptAnswerRepository;
    private final DocumentRepository documentRepository;
    private final UserSubscriptionRepository userSubscriptionRepository;
    private final AiUsageLogRepository aiUsageLogRepository;
    private final AiClient aiClient;
    private final QuestionAccessPolicy accessPolicy;
    private final QuestionValidator questionValidator;
    private final ObjectMapper objectMapper;
    private final CodeQuestionConfigRepository codeQuestionConfigRepository;
    private final CodeTestCaseRepository codeTestCaseRepository;

    @Override
    @Transactional(readOnly = true)


    public Page<QuestionListItemDto> getQuestions(Long courseId, Long moduleId, Long groupId, String groupType, String questionType, List<String> questionTypes, String difficulty, String status, String approvalStatus, String creatorRole, String source, Long createdBy, String search, Pageable pageable, User currentUser) {
        if (!User.ROLE_COURSE_MANAGER.equals(currentUser.getRoleName())) {
            throw new ForbiddenException("Only course managers can access the question bank");
        }
        List<Long> managedCourseIds = courseRepository.findCourseIdsManagedByUser(currentUser.getUserId());
        if (managedCourseIds.isEmpty()) {
            return Page.empty(pageable);
        }
        Set<Long> managedSet = new HashSet<>(managedCourseIds);
        if (courseId != null && !managedSet.contains(courseId)) {
            throw new ForbiddenException("You do not have access to this course");
        }
        if (moduleId != null) {
            Optional<Long> moduleCourseId = moduleRepository.findCourseId(moduleId);
            if (moduleCourseId.isPresent() && !managedSet.contains(moduleCourseId.get())) {
                throw new ForbiddenException("You do not have access to this course");
            }
        }
        if (groupId != null) {
            Optional<QuestionGroup> grp = questionGroupRepository.findById(groupId);
            if (grp.isPresent()) {
                Long groupCourseId = grp.get().getCourse() != null ? grp.get().getCourse().getCourseId()
                        : (grp.get().getModule() != null && grp.get().getModule().getCourse() != null
                        ? grp.get().getModule().getCourse().getCourseId() : null);
                if (groupCourseId == null || !managedSet.contains(groupCourseId)) {
                    throw new ForbiddenException("You do not have access to this course");
                }
            }
        }

        Specification<Question> spec = (root, query, cb) -> {
            var predicate = cb.isNull(root.get("deletedAt"));
            predicate = cb.and(predicate, cb.isNull(root.get("sourceDocumentId")));
            predicate = cb.and(predicate, cb.not(cb.and(
                    cb.equal(cb.coalesce(root.<String>get("source"), ""), "AI"),
                    cb.equal(cb.coalesce(root.<String>get("creatorRole"), ""), "STUDENT")
            )));

                predicate = cb.and(predicate, root.get("course").get("courseId").in(managedCourseIds));

            if (courseId != null) predicate = cb.and(predicate, cb.equal(root.get("course").get("courseId"), courseId));
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



        return page.map(q -> QuestionListItemDto.builder()
                .questionId(q.getQuestionId()).content(q.getContent())
                .courseId(q.getCourse() != null ? q.getCourse().getCourseId() : null)
                .courseName(q.getCourse() != null ? q.getCourse().getTitle() : null)
                .moduleId(q.getModule() != null ? q.getModule().getModuleId() : null)
                .moduleName(q.getModule() != null ? q.getModule().getTitle() : null)
                .groupId(q.getGroup() != null ? q.getGroup().getGroupId() : null)
                .groupTitle(q.getGroup() != null ? q.getGroup().getTitle() : null)
                .groupQuestionType(q.getGroup() != null ? q.getGroup().getQuestionType() : null)
                .questionType(q.getQuestionType()).difficulty(q.getDifficulty())
                .status(q.getStatus()).approvalStatus(q.getApprovalStatus())
                .creatorRole(q.getCreatorRole()).source(q.getSource())
                .createdBy(q.getCreatedBy() != null ? q.getCreatedBy().getUserId() : null)
                .scoringVersion(q.getScoringVersion()).lockVersion(q.getLockVersion())
                .updatedAt(q.getUpdatedAt()).build());
    }



    @Override
    @Transactional
    public List<QuestionDetailDto> createQuestionsBatch(Long courseId, Long moduleId, List<QuestionCreateRequest> requests, User currentUser) {
        if (requests == null || requests.isEmpty() || requests.size() > 50) throw new BadRequestException("Batch size must be between 1 and 50");
        if (courseId == null) throw new BadRequestException("Course ID is required");

        List<ValidationError> errors = new ArrayList<>();
        for (int i = 0; i < requests.size(); i++) {
            QuestionCreateRequest req = requests.get(i);
            req.setCourseId(courseId);
            if (req.getModuleId() == null) {
                req.setModuleId(moduleId);
            }
            errors.addAll(questionValidator.validate(QuestionPayload.from(req), "questions[" + i + "]."));
        }
        if (!errors.isEmpty()) throw new QuestionValidationException(errors);

        Course course = courseRepository.findById(courseId)
                .orElseThrow(() -> new ResourceNotFoundException("Course not found"));

        boolean isPrimaryManager = course.getManager() != null
                && course.getManager().getUserId().equals(currentUser.getUserId());
        boolean isManager = isPrimaryManager || courseManagerRepository.existsByCourse_CourseIdAndUser_UserId(
                course.getCourseId(), currentUser.getUserId());
        if (!isManager) {
            throw new ForbiddenException("You are not a manager of this course");
        }

        Set<Long> requestedModuleIds = new LinkedHashSet<>();
        if (moduleId != null) requestedModuleIds.add(moduleId);
        for (QuestionCreateRequest req : requests) {
            if (req.getModuleId() != null) requestedModuleIds.add(req.getModuleId());
        }
        Map<Long, com.examprep.entities.Module> moduleMap = new HashMap<>();
        for (Long mid : requestedModuleIds) {
            com.examprep.entities.Module mod = moduleRepository.findById(mid)
                    .orElseThrow(() -> new ResourceNotFoundException("Module not found"));
            if (!mod.getCourse().getCourseId().equals(course.getCourseId())) {
                throw new BadRequestException("Module does not belong to the specified course");
            }
            moduleMap.put(mid, mod);
        }

        List<String> hashes = new ArrayList<>(requests.size());
        Set<String> seenHashes = new HashSet<>();
        List<String> duplicateIndexes = new ArrayList<>();

        for (int i = 0; i < requests.size(); i++) {
            QuestionCreateRequest req = requests.get(i);

            if (req.getGroupId() != null) {
                QuestionGroup group = questionGroupRepository.findById(req.getGroupId())
                        .orElseThrow(() -> new ResourceNotFoundException("Question group not found"));
                if (group.getCourse() == null || !group.getCourse().getCourseId().equals(course.getCourseId())) {
                    throw new BadRequestException("Question group does not belong to the specified course");
                }
                Long effectiveModuleId = req.getModuleId();
                if (effectiveModuleId != null && group.getModule() != null && !group.getModule().getModuleId().equals(effectiveModuleId)) {
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
            String status = "INACTIVE";

            QuestionGroup group = null;
            if (req.getGroupId() != null) {
                group = questionGroupRepository.findById(req.getGroupId()).orElse(null);
            }

            String metadataJson = serializeJson(req.getQuestionMetadata(), "questionMetadata");
            Object sanitizedAnswerKey = sanitizeAnswerKey(req.getQuestionType(), req.getAnswerKey());
            String answerKeyJson = serializeJson(sanitizedAnswerKey, "answerKey");
            String rubricJson = serializeJson(sanitizeRubric(req.getEssayGradingRubric()), "essayGradingRubric");

            boolean isOrdering = "ORDERING".equals(req.getQuestionType());
            List<Object> correctOrder = null;
            if (isOrdering && sanitizedAnswerKey instanceof Map<?, ?> map && map.get("correctOrder") instanceof List<?> list) {
                correctOrder = new ArrayList<>(list);
            }

            Question question = Question.builder()
                    .course(course)
                    .module(req.getModuleId() != null ? moduleMap.get(req.getModuleId()) : null)
                    .group(group)
                    .createdBy(currentUser)
                    .questionType(req.getQuestionType())
                    .difficulty(req.getDifficulty() != null ? req.getDifficulty() : "MEDIUM")
                    .content(questionValidator.sanitize(req.getContent()))
                    .questionMetadata(metadataJson)
                    .answerKey(answerKeyJson)
                    .source(source)
                    .creatorRole(creatorRole)
                    .approvalStatus(approvalStatus)
                    .status(status)
                    .aiExplanation(questionValidator.sanitize(req.getExplanation()))
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
            QuestionCreateRequest req = requests.get(i);
            if ("CODE".equals(req.getQuestionType())) {
                saveCodeConfigAndTestCases(q, req.getCodeConfig(), req.getTestCases());
            }
            List<AnswerOptionDto> optDtos = reqOptionsList.get(i);
            boolean isOrdering = isOrderingList.get(i);
            List<AnswerOption> qOptions = new ArrayList<>();

            if (optDtos != null) {
                for (int j = 0; j < optDtos.size(); j++) {
                    AnswerOptionDto optDto = optDtos.get(j);
                    AnswerOption opt = AnswerOption.builder()
                            .question(q)
                            .optionText(questionValidator.sanitize(optDto.getOptionText()))
                            .isCorrect(!isOrdering && (optDto.getIsCorrect() != null ? optDto.getIsCorrect() : false))
                            .explanation(questionValidator.sanitize(optDto.getExplanation()))
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
            throw new ForbiddenException("You do not have permission to update this question");
        }

        if ("ACTIVE".equalsIgnoreCase(q.getStatus()) || "ARCHIVED".equalsIgnoreCase(q.getStatus())) {
            throw new ResourceConflictException("Cannot update question when status is ACTIVE or ARCHIVED");
        }
        return applyUpdate(q, req, false);
    }

    @Override
    @Transactional
    public QuestionDetailDto correctQuestion(Long id, QuestionUpdateRequest req) {
        Question q = questionRepository.findActiveById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Question not found"));
        return applyUpdate(q, req, true);
    }

    private QuestionDetailDto applyUpdate(Question q, QuestionUpdateRequest req, boolean allowNullModule) {
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
        }
        if (req.getLockVersion() != null && !req.getLockVersion().equals(q.getLockVersion())) {
            throw new ResourceConflictException("Resource was modified by another user (lock version mismatch)");
        }

        QuestionGroup targetGroup = req.isGroupIdPresent() && req.getGroupId() == null ? null : q.getGroup();
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
        } else if (req.isGroupIdPresent()) {
            q.setGroup(null);
        }

        boolean isOrdering = "ORDERING".equals(typeToValidate);
        List<AnswerOptionDto> optionsToValidate = req.getOptions();
        if (optionsToValidate == null) {
            List<AnswerOption> existingOpts = answerOptionRepository.findByQuestion_QuestionId(q.getQuestionId());
            optionsToValidate = existingOpts.stream().map(o -> AnswerOptionDto.builder()
                    .optionId(o.getOptionId())
                    .optionText(o.getOptionText())
                    .isCorrect(isOrdering ? null : o.getIsCorrect())
                    .key(isOrdering && o.getOptionId() != null ? String.valueOf(o.getOptionId()) : null)
                    .explanation(o.getExplanation())
                    .orderIndex(o.getOrderIndex())
                    .build()).collect(Collectors.toList());
        }

        Object metadataToValidate = req.getQuestionMetadata() != null ? req.getQuestionMetadata() : parseJson(q.getQuestionMetadata());
        Object answerKeyToValidate = req.getAnswerKey() != null ? req.getAnswerKey() : parseJson(q.getAnswerKey());
        Object rubricToValidate = req.getEssayGradingRubric() != null ? req.getEssayGradingRubric() : parseJson(q.getEssayGradingRubric());
        String contentToValidate = req.getContent() != null ? req.getContent() : q.getContent();
        String difficultyToValidate = req.getDifficulty() != null ? req.getDifficulty() : q.getDifficulty();

        // CODE settings live in their own tables; an update that only touches content/explanation
        // must still validate against the stored config and test cases, not against null.
        CodeConfigDto codeConfigToValidate = null;
        List<TestCaseDto> testCasesToValidate = null;
        if ("CODE".equals(typeToValidate)) {
            codeConfigToValidate = req.getCodeConfig() != null ? req.getCodeConfig() : codeConfigOf(q);
            testCasesToValidate = req.getTestCases() != null ? req.getTestCases() : testCasesOf(q);
        }

        QuestionPayload payload = QuestionPayload.builder()
                .questionType(typeToValidate)
                .difficulty(difficultyToValidate)
                .status(q.getStatus())
                .content(contentToValidate)
                .questionMetadata(metadataToValidate)
                .answerKey(answerKeyToValidate)
                .essayGradingRubric(rubricToValidate)
                .options(optionsToValidate)
                .codeConfig(codeConfigToValidate)
                .testCases(testCasesToValidate)
                .build();

        questionValidator.validateOrThrow(payload);

        List<String> optionTextsForHash = optionsToValidate.stream()
                .map(o -> questionValidator.sanitize(o.getOptionText()))
                .collect(Collectors.toList());
        String sanitizedContentToHash = questionValidator.sanitize(contentToValidate);
        String newHash = ContentHashUtil.computeHash(sanitizedContentToHash, optionTextsForHash);
        Long courseId = q.getCourse() != null ? q.getCourse().getCourseId() : null;
        if (courseId != null) {
            List<Long> duplicateIds = questionRepository.findDuplicateQuestionIds(courseId, newHash, q.getQuestionId(), Pageable.ofSize(1));
            if (!duplicateIds.isEmpty()) {
                throw new ResourceConflictException("Question already exists in course");
            }
        }
        q.setContentHash(newHash);

        boolean scoreAffectingChanged = false;

        if (req.getContent() != null) {
            q.setContent(questionValidator.sanitize(req.getContent()));
        }
        if (req.getDifficulty() != null) q.setDifficulty(req.getDifficulty());
        if (req.getExplanation() != null) {
            q.setAiExplanation(questionValidator.sanitize(req.getExplanation()));
        }

        if (req.getQuestionMetadata() != null) {
            String metaJson = serializeJson(req.getQuestionMetadata(), "questionMetadata");
            if (!metaJson.equals(q.getQuestionMetadata())) {
                if (("DIAGRAM".equals(typeToValidate) || "DIAGRAM_ESSAY".equals(typeToValidate))
                        && diagramXmlChanged(q.getQuestionMetadata(), metaJson)) {
                    scoreAffectingChanged = true;
                }
                q.setQuestionMetadata(metaJson);
            }
        }

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

        if (req.getAnswerKey() != null && !(isOrdering && req.getOptions() != null)) {
            String akJson = serializeJson(sanitizeAnswerKey(typeToValidate, req.getAnswerKey()), "answerKey");
            if (!akJson.equals(q.getAnswerKey())) {
                q.setAnswerKey(akJson);
                scoreAffectingChanged = true;
            }
        }

        if (req.getEssayGradingRubric() != null) {
            String rubricJson = serializeJson(sanitizeRubric(req.getEssayGradingRubric()), "essayGradingRubric");
            if (!rubricJson.equals(q.getEssayGradingRubric())) {
                if (rubricWeightsChanged(q.getEssayGradingRubric(), rubricJson)) {
                    scoreAffectingChanged = true;
                }
                q.setEssayGradingRubric(rubricJson);
            }
        }

        if ("CODE".equals(typeToValidate) && (req.getCodeConfig() != null || req.getTestCases() != null)) {
            if (saveCodeConfigAndTestCases(q, req.getCodeConfig(), req.getTestCases())) {
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
                    if (!isOrdering) {
                        if (!Objects.equals(opt.getOptionText(), text) || !Objects.equals(opt.getIsCorrect(), correct)) {
                            scoreAffectingChanged = true;
                        }
                    } else {
                        if (!Objects.equals(opt.getOptionText(), text)) {
                            // scoring_version does not increase when only optionText changes for ORDERING
                        }
                    }
                    opt.setOptionText(text);
                    opt.setIsCorrect(isOrdering ? false : correct);
                    opt.setExplanation(questionValidator.sanitize(dto.getExplanation()));
                    opt.setOrderIndex(dto.getOrderIndex() != null ? dto.getOrderIndex() : i);
                    updatedOptions.add(opt);
                } else {
                    AnswerOption opt = AnswerOption.builder()
                            .question(q)
                            .optionText(questionValidator.sanitize(dto.getOptionText()))
                            .isCorrect(isOrdering ? false : Boolean.TRUE.equals(dto.getIsCorrect()))
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

        if (isOrdering && (req.getOptions() != null || req.getAnswerKey() != null)) {
            Map<String, Long> keyToIdMap = new HashMap<>();
            if (req.getOptions() != null) {
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
            } else {
                for (AnswerOption o : updatedOptions) {
                    keyToIdMap.put(String.valueOf(o.getOptionId()), o.getOptionId());
                }
            }

            List<Object> coList = null;
            if (req.getAnswerKey() instanceof Map<?, ?> map && map.get("correctOrder") instanceof List<?> list) {
                coList = new ArrayList<>(list);
            }
            if (coList == null) {
                coList = new ArrayList<>(oldCorrectOrder);
            }

            List<Long> newCorrectOrder = new ArrayList<>();
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
                }
            }

            if (!newCorrectOrder.equals(oldCorrectOrder)) {
                scoreAffectingChanged = true;
            }

            String akJson = serializeJson(Map.of("correctOrder", newCorrectOrder), "answerKey");
            q.setAnswerKey(akJson);
        }

        if (scoreAffectingChanged) {
            q.setScoringVersion(q.getScoringVersion() + 1);
        }
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

        lockQuestionCourses(List.of(q));
        entityManager.refresh(q);
        checkArchiveImpact(q, Set.of(q.getQuestionId()));

        List<ExamQuestion> examQuestions = examQuestionRepository.findByQuestion_QuestionId(q.getQuestionId());
        List<ExamQuestion> draftLinks = examQuestions.stream()
                .filter(eq -> eq.getExam() != null && "DRAFT".equals(eq.getExam().getStatus()))
                .toList();
        if (!draftLinks.isEmpty()) {
            examQuestionRepository.deleteAll(draftLinks);
        }
        q.setGroup(null);
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
                .status("INACTIVE")
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

        Question finalCopy = copy;
        if ("CODE".equals(original.getQuestionType())) {
            codeQuestionConfigRepository.findById(original.getQuestionId()).ifPresent(origCfg -> {
                CodeQuestionConfig newCfg = CodeQuestionConfig.builder()
                        .questionId(finalCopy.getQuestionId())
                        .allowedLanguages(origCfg.getAllowedLanguages())
                        .codeTemplate(origCfg.getCodeTemplate())
                        .timeLimitMs(origCfg.getTimeLimitMs())
                        .memoryLimitKb(origCfg.getMemoryLimitKb())
                        .createdAt(Instant.now())
                        .updatedAt(Instant.now())
                        .build();
                codeQuestionConfigRepository.save(newCfg);
            });
            List<CodeTestCase> origCases = codeTestCaseRepository.findByQuestionQuestionIdOrderByOrderIndexAscTestCaseIdAsc(original.getQuestionId());
            if (!origCases.isEmpty()) {
                List<CodeTestCase> newCases = new ArrayList<>();
                for (CodeTestCase tc : origCases) {
                    newCases.add(CodeTestCase.builder()
                            .question(finalCopy)
                            .inputData(tc.getInputData())
                            .expectedOutput(tc.getExpectedOutput())
                            .hidden(tc.getHidden())
                            .orderIndex(tc.getOrderIndex())
                            .createdAt(Instant.now())
                            .build());
                }
                codeTestCaseRepository.saveAll(newCases);
            }
        }

        return mapToDetailDto(finalCopy, copiedOptions);
    }

    @Override
    @Transactional
    public QuestionDetailDto updateQuestionStatus(Long id, QuestionStatusRequest req, User currentUser) {
        Question q = questionRepository.findActiveById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Question not found"));

        if (!accessPolicy.canChangeStatus(currentUser, q)) {
            throw new ForbiddenException("You do not have permission to change status of this question");
        }

        lockQuestionCourses(List.of(q));
        entityManager.refresh(q);

        if (req.getLockVersion() != null && !req.getLockVersion().equals(q.getLockVersion())) {
            throw new ResourceConflictException("Lock version mismatch");
        }

        String currentStatus = q.getStatus() != null ? q.getStatus().toUpperCase() : "INACTIVE";
        String newStatus = req.getStatus() != null ? req.getStatus().toUpperCase() : "";

        if ("INACTIVE".equals(currentStatus) && "ACTIVE".equals(newStatus)) {
            if (!"APPROVED".equals(q.getApprovalStatus())) {
                throw new BadRequestException("Cannot activate question that is not approved");
            }
            List<AnswerOption> options = answerOptionRepository.findByQuestion_QuestionId(q.getQuestionId());
            QuestionPayload payload = QuestionPayload.fromEntity(q, options, objectMapper);
            // CODE settings are stored in separate tables; load them so activation validates the real data.
            payload.setCodeConfig(codeConfigOf(q));
            payload.setTestCases(testCasesOf(q));
            questionValidator.validateOrThrow(payload);
        } else if ("ACTIVE".equals(currentStatus) && "ARCHIVED".equals(newStatus)) {
            checkArchiveImpact(q, Set.of(q.getQuestionId()));
        } else if ("ACTIVE".equals(currentStatus) && ("INACTIVE".equals(newStatus) || "DRAFT".equals(newStatus))) {
            throw new ResourceConflictException("Once active, a question can only be updated to archived");
        } else if ("ARCHIVED".equals(currentStatus)) {
            throw new ResourceConflictException("Archived questions cannot change status");
        } else if (!currentStatus.equals(newStatus)) {
            throw new ResourceConflictException("Invalid status transition from " + currentStatus + " to " + newStatus);
        }

        q.setStatus(newStatus);
        q = questionRepository.save(q);
        List<AnswerOption> options = answerOptionRepository.findByQuestion_QuestionId(q.getQuestionId());
        return mapToDetailDto(q, options);
    }

    @Override
    @Transactional
    public List<QuestionDetailDto> batchUpdateStatus(QuestionBatchStatusRequest req, User currentUser) {
        if (req == null || req.getQuestionIds() == null || req.getQuestionIds().isEmpty()) {
            throw new BadRequestException("Question IDs are required");
        }
        String newStatus = req.getStatus() != null ? req.getStatus().toUpperCase() : "";
        List<Question> batch = new ArrayList<>();
        for (Long id : req.getQuestionIds()) {
            Question question = questionRepository.findActiveById(id)
                    .orElseThrow(() -> new ResourceNotFoundException("Question not found"));
            if (!accessPolicy.canChangeStatus(currentUser, question)) {
                throw new ForbiddenException("You do not have permission to change status of this question");
            }
            batch.add(question);
        }
        lockQuestionCourses(batch);
        if ("ARCHIVED".equals(newStatus)) {
            Set<Long> batchIds = batch.stream().map(Question::getQuestionId).collect(Collectors.toSet());
            for (Question question : batch) {
                entityManager.refresh(question);
                if ("ACTIVE".equals(question.getStatus())) checkArchiveImpact(question, batchIds);
            }
        }
        List<QuestionDetailDto> results = new ArrayList<>();
        for (Long id : req.getQuestionIds()) {
            QuestionStatusRequest sReq = QuestionStatusRequest.builder().status(newStatus).build();
            results.add(updateQuestionStatus(id, sReq, currentUser));
        }
        return results;
    }

    @Override
    @Transactional
    public QuestionGroupBatchCreateResponse createGroupWithQuestions(QuestionGroupBatchCreateRequest request, User currentUser) {
        if (request == null || request.getQuestions() == null || request.getQuestions().isEmpty() || request.getQuestions().size() > 50) {
            throw new BadRequestException("Question group must contain between 1 and 50 questions.");
        }
        if (request.getCourseId() == null) {
            throw new BadRequestException("Course ID is required");
        }

        String questionType = QuestionTypeUtil.requireKind(request.getQuestionType());
        String title = request.getTitle() == null ? "" : request.getTitle().trim();
        String passageText = request.getPassageText() == null ? "" : request.getPassageText().trim();
        if (title.isEmpty()) {
            throw new BadRequestException("Group title is required");
        }
        if (passageText.isEmpty()) {
            throw new BadRequestException("Shared passage is required");
        }

        Course course = courseRepository.findById(request.getCourseId())
                .orElseThrow(() -> new ResourceNotFoundException("Course not found"));

        boolean isPrimaryManager = course.getManager() != null
                && course.getManager().getUserId().equals(currentUser.getUserId());
        boolean isManager = isPrimaryManager || courseManagerRepository.existsByCourse_CourseIdAndUser_UserId(
                course.getCourseId(), currentUser.getUserId());
        if (!isManager) {
            throw new ForbiddenException("You are not a manager of this course");
        }

        com.examprep.entities.Module module = null;
        if (request.getModuleId() != null) {
            module = moduleRepository.findById(request.getModuleId())
                    .orElseThrow(() -> new ResourceNotFoundException("Module not found"));
            if (!module.getCourse().getCourseId().equals(course.getCourseId())) {
                throw new BadRequestException("Module does not belong to the specified course");
            }
        }

        QuestionGroup group = QuestionGroup.builder()
                .course(course)
                .module(module)
                .questionType(questionType)
                .title(title)
                .passageText(passageText)
                .build();
        QuestionGroup savedGroup = questionGroupRepository.saveAndFlush(group);

        for (QuestionCreateRequest qReq : request.getQuestions()) {
            qReq.setCourseId(request.getCourseId());
            if (qReq.getModuleId() == null) {
                qReq.setModuleId(request.getModuleId());
            }
            qReq.setGroupId(savedGroup.getGroupId());
        }

        List<QuestionDetailDto> createdQuestions = createQuestionsBatch(
                request.getCourseId(), request.getModuleId(), request.getQuestions(), currentUser);

        QuestionGroupResponse groupDto = QuestionGroupResponse.builder()
                .groupId(savedGroup.getGroupId())
                .courseId(course.getCourseId())
                .courseName(course.getTitle())
                .moduleId(module != null ? module.getModuleId() : null)
                .moduleName(module != null ? module.getTitle() : null)
                .questionType(savedGroup.getQuestionType())
                .title(savedGroup.getTitle())
                .passageText(savedGroup.getPassageText())
                .questionCount(createdQuestions.size())
                .publishedQuestionCount(0L)
                .draftQuestionCount(createdQuestions.size())
                .build();

        return QuestionGroupBatchCreateResponse.builder()
                .group(groupDto)
                .questions(createdQuestions)
                .build();
    }

    @Override
    @Transactional
    public QuestionGroupResponse publishGroupQuestions(Long groupId, User currentUser) {
        QuestionGroup group = questionGroupRepository.findById(groupId)
                .orElseThrow(() -> new ResourceNotFoundException("Question group not found with id: " + groupId));

        Course course = group.getCourse() != null
                ? group.getCourse()
                : (group.getModule() != null ? group.getModule().getCourse() : null);
        boolean isPrimaryManager = course != null && course.getManager() != null
                && course.getManager().getUserId().equals(currentUser.getUserId());
        boolean isManager = isPrimaryManager || (course != null && courseManagerRepository.existsByCourse_CourseIdAndUser_UserId(
                course.getCourseId(), currentUser.getUserId()));
        if (!isManager) {
            throw new ForbiddenException("You are not a manager of this course");
        }

        List<Question> members = questionRepository.findByGroupGroupIdOrderByQuestionIdAsc(groupId);
        if (members.isEmpty()) {
            throw new BadRequestException("Question group has no questions to publish.");
        }

        List<Long> draftIds = members.stream()
                .filter(q -> "INACTIVE".equalsIgnoreCase(q.getStatus()))
                .map(Question::getQuestionId)
                .toList();
        if (!draftIds.isEmpty()) {
            batchUpdateStatus(QuestionBatchStatusRequest.builder()
                    .questionIds(draftIds)
                    .status("ACTIVE")
                    .build(), currentUser);
            entityManager.flush();
        }

        List<Question> refreshed = questionRepository.findByGroupGroupIdOrderByQuestionIdAsc(groupId);
        long total = refreshed.size();
        long published = refreshed.stream().filter(q -> "ACTIVE".equalsIgnoreCase(q.getStatus())).count();
        long draft = refreshed.stream().filter(q -> "INACTIVE".equalsIgnoreCase(q.getStatus())).count();

        return QuestionGroupResponse.builder()
                .groupId(group.getGroupId())
                .courseId(course != null ? course.getCourseId() : null)
                .courseName(course != null ? course.getTitle() : null)
                .moduleId(group.getModule() != null ? group.getModule().getModuleId() : null)
                .moduleName(group.getModule() != null ? group.getModule().getTitle() : null)
                .questionType(group.getQuestionType())
                .title(group.getTitle())
                .passageText(group.getPassageText())
                .questionCount(total)
                .publishedQuestionCount(published)
                .draftQuestionCount(draft)
                .build();
    }

    private void lockQuestionCourses(List<Question> questions) {
        Set<Long> courseIds = new TreeSet<>();
        for (Question question : questions) {
            if (question.getCourse() != null) courseIds.add(question.getCourse().getCourseId());
            if (question.getModule() != null) courseIds.add(question.getModule().getCourse().getCourseId());
            if (question.getGroup() != null && question.getGroup().getCourse() != null) {
                courseIds.add(question.getGroup().getCourse().getCourseId());
            }
            if (question.getGroup() != null && question.getGroup().getModule() != null) {
                courseIds.add(question.getGroup().getModule().getCourse().getCourseId());
            }
        }
        for (Long courseId : courseIds) courseRepository.findForUpdate(courseId);
    }

    private void checkArchiveImpact(Question question, Set<Long> archivedIds) {
        Map<Long, Exam> affected = new LinkedHashMap<>();
        for (ExamQuestion link : examQuestionRepository.findByQuestion_QuestionId(question.getQuestionId())) {
            if ("PUBLISHED".equals(link.getExam().getStatus())) {
                affected.put(link.getExam().getExamId(), link.getExam());
            }
        }
        if (question.getGroup() != null) {
            for (Exam exam : examGroupRepository.findPublishedExamsByGroupId(question.getGroup().getGroupId())) {
                affected.put(exam.getExamId(), exam);
            }
        }

        Set<Long> courseIds = new HashSet<>();
        if (question.getCourse() != null) courseIds.add(question.getCourse().getCourseId());
        if (question.getModule() != null) courseIds.add(question.getModule().getCourse().getCourseId());
        if (!courseIds.isEmpty() && question.getSourceDocumentId() == null
                && "APPROVED".equals(question.getApprovalStatus())) {
            for (ExamConfig rule : examConfigRepository.findPublishedByCourseIds(courseIds)) {
                Exam exam = rule.getExam();
                Long examCourseId = exam.getCourse() != null ? exam.getCourse().getCourseId()
                        : exam.getModule().getCourse().getCourseId();
                Long moduleId = rule.getModule() == null ? null : rule.getModule().getModuleId();
                List<Long> pool = questionRepository.findDrawableIds(examCourseId, moduleId,
                        rule.getQuestionType(), rule.getDifficulty());
                if (!pool.contains(question.getQuestionId())) continue;
                Set<Long> fixedIds = examQuestionRepository.findAllByExamIds(List.of(exam.getExamId())).stream()
                        .map(link -> link.getQuestion().getQuestionId()).collect(Collectors.toSet());
                List<ExamGroup> groups = examGroupRepository.findAllByExamIds(List.of(exam.getExamId()));
                if (!groups.isEmpty()) {
                    List<Long> groupIds = groups.stream().map(link -> link.getGroup().getGroupId()).toList();
                    questionRepository.findAllByGroupIds(groupIds).forEach(q -> fixedIds.add(q.getQuestionId()));
                }
                long remaining = pool.stream().filter(id -> !archivedIds.contains(id) && !fixedIds.contains(id)).count();
                if (remaining < rule.getNumberOfQuestions()) affected.put(exam.getExamId(), exam);
            }
        }
        if (!affected.isEmpty()) {
            String ids = affected.keySet().stream().map(String::valueOf).collect(Collectors.joining(", "));
            throw new ResourceConflictException("Cannot archive question. Published exam(s) would be affected: " + ids);
        }
    }



    private boolean saveCodeConfigAndTestCases(Question q, CodeConfigDto cfgDto, List<TestCaseDto> tcDtos) {
        CodeQuestionConfig existing = codeQuestionConfigRepository.findById(q.getQuestionId()).orElse(null);

        // A partial update (only codeConfig or only testCases) must not reset the other half.
        String allowedLangsJson = cfgDto != null
                ? serializeJson(cfgDto.getAllowedLanguages(), "allowedLanguages")
                : existing != null ? existing.getAllowedLanguages() : null;
        String codeTemplate = cfgDto != null && cfgDto.getCodeTemplate() != null
                ? cfgDto.getCodeTemplate()
                : existing != null ? existing.getCodeTemplate() : null;
        Integer timeLimitMs = cfgDto != null && cfgDto.getTimeLimitMs() != null
                ? cfgDto.getTimeLimitMs()
                : existing != null && existing.getTimeLimitMs() != null ? existing.getTimeLimitMs() : 5000;
        Integer memoryLimitKb = cfgDto != null && cfgDto.getMemoryLimitKb() != null
                ? cfgDto.getMemoryLimitKb()
                : existing != null && existing.getMemoryLimitKb() != null ? existing.getMemoryLimitKb() : 262144;

        boolean configChanged = existing == null
                || !Objects.equals(existing.getAllowedLanguages(), allowedLangsJson)
                || !Objects.equals(existing.getCodeTemplate(), codeTemplate)
                || !Objects.equals(existing.getTimeLimitMs(), timeLimitMs)
                || !Objects.equals(existing.getMemoryLimitKb(), memoryLimitKb);

        CodeQuestionConfig config = CodeQuestionConfig.builder()
                .questionId(q.getQuestionId())
                .allowedLanguages(allowedLangsJson)
                .codeTemplate(codeTemplate)
                .timeLimitMs(timeLimitMs)
                .memoryLimitKb(memoryLimitKb)
                .createdAt(existing != null && existing.getCreatedAt() != null ? existing.getCreatedAt() : Instant.now())
                .updatedAt(Instant.now())
                .build();
        codeQuestionConfigRepository.save(config);

        boolean testCasesChanged = false;
        if (tcDtos != null) {
            List<CodeTestCase> existingCases = codeTestCaseRepository.findByQuestionQuestionIdOrderByOrderIndexAscTestCaseIdAsc(q.getQuestionId());
            List<CodeTestCase> testCases = new ArrayList<>();
            int order = 0;
            for (TestCaseDto tcDto : tcDtos) {
                testCases.add(CodeTestCase.builder()
                        .question(q)
                        .inputData(tcDto.getInputData() != null ? tcDto.getInputData() : "")
                        .expectedOutput(tcDto.getExpectedOutput() != null ? tcDto.getExpectedOutput() : "")
                        .hidden(Boolean.TRUE.equals(tcDto.getHidden()))
                        .orderIndex(tcDto.getOrderIndex() != null ? tcDto.getOrderIndex() : order++)
                        .createdAt(Instant.now())
                        .build());
            }
            testCasesChanged = testCasesChanged(existingCases, testCases);
            codeTestCaseRepository.deleteAll(existingCases);
            codeTestCaseRepository.saveAll(testCases);
        }
        return configChanged || testCasesChanged;
    }

    private boolean testCasesChanged(List<CodeTestCase> existingCases, List<CodeTestCase> updatedCases) {
        if (existingCases.size() != updatedCases.size()) {
            return true;
        }
        for (int i = 0; i < existingCases.size(); i++) {
            CodeTestCase a = existingCases.get(i);
            CodeTestCase b = updatedCases.get(i);
            if (!Objects.equals(a.getInputData(), b.getInputData())
                    || !Objects.equals(a.getExpectedOutput(), b.getExpectedOutput())
                    || !Objects.equals(a.getHidden(), b.getHidden())
                    || !Objects.equals(a.getOrderIndex(), b.getOrderIndex())) {
                return true;
            }
        }
        return false;
    }

    @Override
    public CodeConfigDto codeConfigOf(Question q) {
        if (!"CODE".equals(q.getQuestionType())) return null;
        CodeQuestionConfig cfg = codeQuestionConfigRepository.findById(q.getQuestionId()).orElse(null);
        if (cfg == null) return null;
        List<String> langs = null;
        try {
            if (cfg.getAllowedLanguages() != null && !cfg.getAllowedLanguages().isBlank()) {
                langs = objectMapper.readValue(cfg.getAllowedLanguages(), new TypeReference<List<String>>() {});
            }
        } catch (Exception ignored) {}
        return CodeConfigDto.builder()
                .allowedLanguages(langs)
                .codeTemplate(cfg.getCodeTemplate())
                .timeLimitMs(cfg.getTimeLimitMs())
                .memoryLimitKb(cfg.getMemoryLimitKb())
                .build();
    }

    @Override
    public List<TestCaseDto> testCasesOf(Question q) {
        if (!"CODE".equals(q.getQuestionType())) return null;
        List<CodeTestCase> cases = codeTestCaseRepository.findByQuestionQuestionIdOrderByOrderIndexAscTestCaseIdAsc(q.getQuestionId());
        return cases.stream().map(tc -> TestCaseDto.builder()
                .testCaseId(tc.getTestCaseId())
                .inputData(tc.getInputData())
                .expectedOutput(tc.getExpectedOutput())
                .hidden(tc.getHidden())
                .orderIndex(tc.getOrderIndex())
                .build()).collect(Collectors.toList());
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

        CodeConfigDto codeConfig = codeConfigOf(q);
        List<TestCaseDto> testCases = testCasesOf(q);

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
                .codeConfig(codeConfig)
                .testCases(testCases)
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
        List<String> optionTexts = req.getOptions() == null ? null : req.getOptions().stream()
                .map(o -> questionValidator.sanitize(o.getOptionText()))
                .collect(Collectors.toList());
        return ContentHashUtil.computeHash(questionValidator.sanitize(req.getContent()), optionTexts);
    }

    @SuppressWarnings("unchecked")
    private Object sanitizeAnswerKey(String questionType, Object rawAnswerKey) {
        if (rawAnswerKey == null || !"MATCHING".equals(questionType)) {
            return rawAnswerKey;
        }
        Map<String, Object> copy = rawAnswerKey instanceof Map
                ? new LinkedHashMap<>((Map<String, Object>) rawAnswerKey)
                : objectMapper.convertValue(rawAnswerKey, new TypeReference<LinkedHashMap<String, Object>>() {});
        if (copy.get("pairs") instanceof List<?> pairs) {
            List<Object> cleanedPairs = new ArrayList<>(pairs.size());
            for (Object p : pairs) {
                if (p instanceof Map<?, ?> pairMap) {
                    Map<String, Object> pairCopy = new LinkedHashMap<>();
                    pairMap.forEach((k, v) -> pairCopy.put(String.valueOf(k), v));
                    if (pairCopy.get("left") != null) pairCopy.put("left", questionValidator.sanitize(pairCopy.get("left").toString()));
                    if (pairCopy.get("right") != null) pairCopy.put("right", questionValidator.sanitize(pairCopy.get("right").toString()));
                    cleanedPairs.add(pairCopy);
                } else {
                    cleanedPairs.add(p);
                }
            }
            copy.put("pairs", cleanedPairs);
        }
        return copy;
    }

    @SuppressWarnings("unchecked")
    private Object sanitizeRubric(Object rawRubric) {
        if (rawRubric == null) {
            return null;
        }
        Map<String, Object> copy = rawRubric instanceof Map
                ? new LinkedHashMap<>((Map<String, Object>) rawRubric)
                : objectMapper.convertValue(rawRubric, new TypeReference<LinkedHashMap<String, Object>>() {});
        if (copy.get("notes") != null) {
            copy.put("notes", questionValidator.sanitize(copy.get("notes").toString()));
        }
        if (copy.get("criteria") instanceof List<?> criteria) {
            List<Object> cleaned = new ArrayList<>(criteria.size());
            for (Object item : criteria) {
                if (item instanceof Map<?, ?> critMap) {
                    Map<String, Object> critCopy = new LinkedHashMap<>();
                    critMap.forEach((k, v) -> critCopy.put(String.valueOf(k), v));
                    if (critCopy.get("name") != null) critCopy.put("name", questionValidator.sanitize(critCopy.get("name").toString()));
                    if (critCopy.get("descriptors") != null) critCopy.put("descriptors", questionValidator.sanitize(critCopy.get("descriptors").toString()));
                    cleaned.add(critCopy);
                } else {
                    cleaned.add(item);
                }
            }
            copy.put("criteria", cleaned);
        }
        return copy;
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
