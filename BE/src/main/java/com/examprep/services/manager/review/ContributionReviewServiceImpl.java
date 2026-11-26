package com.examprep.services.manager.review;

import com.examprep.dto.question.CodeConfigDto;
import com.examprep.dto.question.TestCaseDto;
import com.examprep.entities.Course;
import com.examprep.entities.Question;
import com.examprep.entities.QuestionContribution;
import com.examprep.entities.QuestionGroup;
import com.examprep.entities.ReviewLog;
import com.examprep.entities.User;
import com.examprep.exceptions.BadRequestException;
import com.examprep.exceptions.ResourceNotFoundException;
import com.examprep.exceptions.ReviewException;
import com.examprep.repositories.CourseRepository;
import com.examprep.repositories.ModuleRepository;
import com.examprep.repositories.QuestionContributionRepository;
import com.examprep.repositories.QuestionGroupRepository;
import com.examprep.repositories.ReviewLogRepository;
import com.examprep.repositories.UserRepository;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class ContributionReviewServiceImpl implements ContributionReviewService {

    private static final int MAX_PAGE_SIZE = 100;
    private static final int PREVIEW_MAX_LENGTH = 120;
    private static final long STATS_WINDOW_SECONDS = 30L * 24 * 60 * 60;
    private static final String TARGET_TYPE = "QUESTION_CONTRIBUTION";
    private static final Set<String> ALLOWED_SORT_FIELDS = Set.of(
            "submittedAt", "updatedAt", "reviewedAt", "title",
            "status", "difficulty", "questionType", "contributionId"
    );

    private final QuestionContributionRepository contributionRepository;
    private final CourseRepository courseRepository;
    private final ModuleRepository moduleRepository;
    private final QuestionGroupRepository questionGroupRepository;
    private final ReviewLogRepository reviewLogRepository;
    private final UserRepository userRepository;
    private final QuestionPromotionService questionPromotionService;
    private final ReviewNotificationService reviewNotificationService;
    private final ObjectMapper objectMapper;

    @Override
    @Transactional(readOnly = true)
    public Map<String, Object> listContributions(Long managerId, Long courseId, Long moduleId, String questionType,
                                                 String difficulty, String status, Long contributorId,
                                                 String keyword, Instant submittedFrom, Instant submittedTo,
                                                 int page, int size, String sort) {
        User manager = getManager(managerId);
        Pageable pageable = buildPageable(page, size, sort);

        List<Long> scopeCourseIds = resolveScopeCourseIds(manager, courseId);
        if (scopeCourseIds != null && scopeCourseIds.isEmpty()) {
            return toPageResponse(Page.empty(pageable), List.of());
        }

        String normalizedStatus = normalizeStatus(status);
        String keywordPattern = buildKeywordPattern(keyword);

        Page<QuestionContribution> pageResult = contributionRepository.findManagedContributions(
                scopeCourseIds, moduleId, questionType, difficulty,
                normalizedStatus, contributorId, keywordPattern, submittedFrom, submittedTo, pageable
        );

        List<QuestionContribution> items = pageResult.getContent();
        Map<Long, Course> courses = loadCourses(items);
        Map<Long, com.examprep.entities.Module> modules = loadModules(items);
        Map<Long, User> contributors = loadContributors(items);

        List<Map<String, Object>> content = new ArrayList<>();
        for (QuestionContribution item : items) {
            content.add(toContributionSummary(item, manager, courses, modules, contributors));
        }

        return toPageResponse(pageResult, content);
    }

    @Override
    @Transactional(readOnly = true)
    public Map<String, Object> getContributionDetail(Long managerId, Long id) {
        User manager = getManager(managerId);
        QuestionContribution c = contributionRepository.findById(id)
                .orElseThrow(() -> new ReviewException(HttpStatus.NOT_FOUND, "RESOURCE_NOT_FOUND", null, "Contribution not found"));
        assertCanAccessCourse(manager, c.getCourseId());

        Course course = c.getCourseId() != null ? courseRepository.findById(c.getCourseId()).orElse(null) : null;
        com.examprep.entities.Module module = c.getModuleId() != null ? moduleRepository.findById(c.getModuleId()).orElse(null) : null;
        User contributor = c.getUserId() != null ? userRepository.findById(c.getUserId()).orElse(null) : null;

        List<ReviewLog> logs = reviewLogRepository.findByTargetTypeAndTargetIdOrderByCreatedAtDesc(TARGET_TYPE, id);
        List<Map<String, Object>> history = new ArrayList<>();
        for (ReviewLog log : logs) {
            history.add(toHistoryItem(log));
        }

        Map<String, Object> data = new HashMap<>();
        data.put("contributionId", c.getContributionId());
        data.put("courseId", c.getCourseId());
        data.put("course", courseSummary(course));
        data.put("contributorId", c.getUserId());
        data.put("contributor", contributorSummary(contributor));
        data.put("type", c.getType());
        data.put("status", c.getStatus());
        data.put("title", defaultString(c.getTitle()));
        data.put("content", c.getContent());
        data.put("moduleId", c.getModuleId());
        data.put("module", moduleSummary(module));
        data.put("groupId", c.getGroupId());
        data.put("questionType", defaultString(c.getQuestionType()));
        data.put("options", c.getOptionsJson() == null ? List.of() : readJson(c.getOptionsJson(), new TypeReference<Object>() {}));
        data.put("answerKey", resolveAnswerKey(c));
        data.put("explanation", defaultString(c.getExplanation()));
        data.put("difficulty", c.getDifficulty() != null ? c.getDifficulty() : "MEDIUM");
        data.put("essayGradingRubric", readJson(c.getEssayGradingRubricJson(), new TypeReference<Object>() {}));
        data.put("questionMetadata", readJson(c.getQuestionMetadataJson(), new TypeReference<Object>() {}));
        data.put("codeConfig", readJson(c.getCodeConfigJson(), new TypeReference<CodeConfigDto>() {}));
        data.put("testCases", readJson(c.getTestCasesJson(), new TypeReference<List<TestCaseDto>>() {}));
        data.put("sourceReference", defaultString(c.getSourceReference()));
        data.put("reviewNote", defaultString(c.getReviewNote()));
        data.put("resubmissionCount", c.getResubmissionCount());
        data.put("createdAt", c.getSubmittedAt());
        data.put("reviewedAt", c.getReviewedAt());
        data.put("history", history);
        data.put("canReview", canReview(c, manager));
        data.put("version", c.getVersion() != null ? c.getVersion() : 0L);

        return data;
    }

    @Override
    @Transactional
    public Map<String, Object> approve(Long managerId, Long id, Long requestVersion, String note) {
        return approve(getManager(managerId), id, requestVersion, note);
    }

    @Override
    @Transactional
    public Map<String, Object> approve(User manager, Long id, Long requestVersion, String note) {
        QuestionContribution c = loadReviewableContribution(manager, id, requestVersion);

        Course course = courseRepository.findById(c.getCourseId())
                .orElseThrow(() -> new ReviewException(HttpStatus.NOT_FOUND, "RESOURCE_NOT_FOUND", null, "Course not found"));
        com.examprep.entities.Module module = c.getModuleId() != null ? moduleRepository.findById(c.getModuleId()).orElse(null) : null;
        QuestionGroup group = c.getGroupId() != null ? questionGroupRepository.findById(c.getGroupId()).orElse(null) : null;

        Question savedQuestion = questionPromotionService.promoteContribution(c, course, module, group, manager);

        c.setStatus("ACCEPTED");
        c.setReviewedBy(manager.getUserId());
        c.setReviewedAt(Instant.now());
        c.setReviewNote(note);
        c.setAcceptedQuestionId(savedQuestion.getQuestionId());
        QuestionContribution savedContribution = contributionRepository.save(c);

        saveReviewLog(c.getContributionId(), manager.getUserId(), "APPROVED", note);

        String title = "Your contributed question was approved";
        String contribTitle = c.getTitle() != null ? c.getTitle() : "Contribution";
        String content = "Your question \"" + contribTitle + "\" in course \"" + course.getTitle() + "\" has been approved and added to the question bank.";
        reviewNotificationService.sendNotification(
                c.getUserId(), title, content, "CONTRIBUTION_APPROVED",
                TARGET_TYPE, String.valueOf(c.getContributionId()),
                "/student/contributions/" + c.getContributionId()
        );

        return Map.of(
                "contributionId", savedContribution.getContributionId(),
                "status", savedContribution.getStatus(),
                "acceptedQuestionId", savedQuestion.getQuestionId(),
                "reviewedBy", manager.getUserId(),
                "reviewedAt", savedContribution.getReviewedAt(),
                "version", savedContribution.getVersion()
        );
    }

    @Override
    @Transactional
    public Map<String, Object> reject(Long managerId, Long id, Long requestVersion, String reason) {
        return reject(getManager(managerId), id, requestVersion, reason);
    }

    @Override
    @Transactional
    public Map<String, Object> reject(User manager, Long id, Long requestVersion, String reason) {
        if (reason == null || reason.strip().length() < 5) {
            throw new ReviewException(HttpStatus.UNPROCESSABLE_ENTITY, "VALIDATION_ERROR", "REASON_REQUIRED", "Reason is required (at least 5 characters)");
        }

        QuestionContribution c = loadReviewableContribution(manager, id, requestVersion);
        String cleanReason = reason.strip();

        c.setStatus("REJECTED");
        c.setReviewedBy(manager.getUserId());
        c.setReviewedAt(Instant.now());
        c.setReviewNote(cleanReason);
        QuestionContribution savedContribution = contributionRepository.save(c);

        saveReviewLog(c.getContributionId(), manager.getUserId(), "REJECTED", cleanReason);

        boolean canResubmit = c.getResubmissionCount() == null || c.getResubmissionCount() < 1;
        String title = "Your contributed question was not approved";
        String content = "Your question was rejected. Reason: " + cleanReason
                + (canResubmit ? " You have 1 remaining attempt to edit and resubmit." : " You have used all submission attempts.");
        reviewNotificationService.sendNotification(
                c.getUserId(), title, content, "CONTRIBUTION_REJECTED",
                TARGET_TYPE, String.valueOf(c.getContributionId()),
                "/student/contributions/" + c.getContributionId()
        );

        return Map.of(
                "contributionId", savedContribution.getContributionId(),
                "status", savedContribution.getStatus(),
                "canResubmit", canResubmit,
                "reviewedBy", manager.getUserId(),
                "reviewedAt", savedContribution.getReviewedAt(),
                "version", savedContribution.getVersion()
        );
    }

    @Override
    @Transactional(readOnly = true)
    public Map<String, Object> stats(Long managerId, Long courseId) {
        return stats(getManager(managerId), courseId);
    }

    @Override
    @Transactional(readOnly = true)
    public Map<String, Object> stats(User manager, Long courseId) {
        List<Long> scopeCourseIds = resolveScopeCourseIds(manager, courseId);
        if (scopeCourseIds != null && scopeCourseIds.isEmpty()) {
            return Map.of("pending", 0L, "approvedLast30d", 0L, "rejectedLast30d", 0L, "approvalRate", 0.0, "byCourse", List.of());
        }

        Instant thirtyDaysAgo = Instant.now().minusSeconds(STATS_WINDOW_SECONDS);

        long pending = contributionRepository.countPending(scopeCourseIds);
        long approved30 = contributionRepository.countApprovedSince(scopeCourseIds, thirtyDaysAgo);
        long rejected30 = contributionRepository.countRejectedSince(scopeCourseIds, thirtyDaysAgo);

        double approvalRate = (approved30 + rejected30) > 0
                ? (double) approved30 / (approved30 + rejected30)
                : 0.0;

        List<Object[]> courseCounts = contributionRepository.countPendingByCourse(scopeCourseIds);
        List<Map<String, Object>> byCourse = new ArrayList<>();
        for (Object[] row : courseCounts) {
            byCourse.add(Map.of(
                    "courseId", row[0],
                    "courseTitle", row[1],
                    "pending", row[2]
            ));
        }

        return Map.of(
                "pending", pending,
                "approvedLast30d", approved30,
                "rejectedLast30d", rejected30,
                "approvalRate", approvalRate,
                "byCourse", byCourse
        );
    }

    private User getManager(Long managerId) {
        return userRepository.findById(managerId)
                .orElseThrow(() -> new ResourceNotFoundException("User not found"));
    }

    private List<Long> getMyCourseIds(User manager) {
        if (manager == null) {
            return List.of();
        }
        return courseRepository.findCourseIdsManagedByUser(manager.getUserId());
    }

    private List<Long> resolveScopeCourseIds(User manager, Long courseId) {
        if (courseId != null) {
            assertCanAccessCourse(manager, courseId);
            return List.of(courseId);
        }
        return getMyCourseIds(manager);
    }

    private void assertCanAccessCourse(User manager, Long courseId) {
        boolean hasAccess = courseRepository.existsManagedCourse(courseId, manager.getUserId());
        if (!hasAccess) {
            throw new ReviewException(HttpStatus.NOT_FOUND, "RESOURCE_NOT_FOUND", null, "Course not found or outside scope");
        }
    }

    private QuestionContribution loadReviewableContribution(User manager, Long id, Long requestVersion) {
        QuestionContribution c = contributionRepository.findForUpdate(id)
                .orElseThrow(() -> new ReviewException(HttpStatus.NOT_FOUND, "RESOURCE_NOT_FOUND", null, "Contribution not found"));
        assertCanAccessCourse(manager, c.getCourseId());

        if (c.getUserId().equals(manager.getUserId())) {
            throw new ReviewException(HttpStatus.FORBIDDEN, "FORBIDDEN", "CANNOT_REVIEW_OWN", "Cannot review your own contribution");
        }
        if (!"PENDING".equals(c.getStatus())) {
            throw new ReviewException(HttpStatus.CONFLICT, "RESOURCE_CONFLICT", "ALREADY_REVIEWED",
                    "Contribution already reviewed", Map.of("currentStatus", c.getStatus()));
        }
        if (requestVersion != null && !requestVersion.equals(c.getVersion())) {
            throw new ReviewException(HttpStatus.CONFLICT, "RESOURCE_CONFLICT", "VERSION_CONFLICT",
                    "Version mismatch", Map.of("currentVersion", c.getVersion(), "currentStatus", c.getStatus()));
        }
        return c;
    }

    private void saveReviewLog(Long contributionId, Long reviewerId, String decision, String note) {
        ReviewLog log = ReviewLog.builder()
                .targetType(TARGET_TYPE)
                .targetId(contributionId)
                .reviewerId(reviewerId)
                .decision(decision)
                .note(note)
                .build();
        reviewLogRepository.save(log);
    }

    private Pageable buildPageable(int page, int size, String sort) {
        if (page < 0 || size < 1) {
            throw new BadRequestException("Invalid page or size.");
        }
        int safeSize = Math.min(size, MAX_PAGE_SIZE);

        String[] sortParts = sort != null ? sort.split(",") : new String[0];
        Sort.Direction direction = sortParts.length > 1 && "desc".equalsIgnoreCase(sortParts[1].trim())
                ? Sort.Direction.DESC
                : Sort.Direction.ASC;
        String rawField = sortParts.length > 0 ? sortParts[0].trim() : "submittedAt";
        String sortField = ALLOWED_SORT_FIELDS.contains(rawField) ? rawField : "submittedAt";

        return PageRequest.of(page, safeSize, Sort.by(direction, sortField));
    }

    private String normalizeStatus(String status) {
        String normalized = (status == null || status.isBlank()) ? "PENDING" : status.toUpperCase();
        return "ALL".equals(normalized) ? null : normalized;
    }

    private String buildKeywordPattern(String keyword) {
        if (keyword == null || keyword.isBlank()) {
            return null;
        }
        String escaped = keyword.strip().toLowerCase()
                .replace("!", "!!")
                .replace("%", "!%")
                .replace("_", "!_");
        return "%" + escaped + "%";
    }

    private Map<Long, Course> loadCourses(List<QuestionContribution> items) {
        Set<Long> ids = new HashSet<>();
        for (QuestionContribution item : items) {
            if (item.getCourseId() != null) {
                ids.add(item.getCourseId());
            }
        }
        Map<Long, Course> result = new HashMap<>();
        for (Course course : courseRepository.findAllById(ids)) {
            result.put(course.getCourseId(), course);
        }
        return result;
    }

    private Map<Long, com.examprep.entities.Module> loadModules(List<QuestionContribution> items) {
        Set<Long> ids = new HashSet<>();
        for (QuestionContribution item : items) {
            if (item.getModuleId() != null) {
                ids.add(item.getModuleId());
            }
        }
        Map<Long, com.examprep.entities.Module> result = new HashMap<>();
        for (com.examprep.entities.Module module : moduleRepository.findAllById(ids)) {
            result.put(module.getModuleId(), module);
        }
        return result;
    }

    private Map<Long, User> loadContributors(List<QuestionContribution> items) {
        Set<Long> ids = new HashSet<>();
        for (QuestionContribution item : items) {
            if (item.getUserId() != null) {
                ids.add(item.getUserId());
            }
        }
        Map<Long, User> result = new HashMap<>();
        for (User user : userRepository.findAllById(ids)) {
            result.put(user.getUserId(), user);
        }
        return result;
    }

    private Map<String, Object> toContributionSummary(
            QuestionContribution c,
            User manager,
            Map<Long, Course> courses,
            Map<Long, com.examprep.entities.Module> modules,
            Map<Long, User> contributors) {

        Map<String, Object> map = new LinkedHashMap<>();
        map.put("contributionId", c.getContributionId());
        map.put("title", defaultString(c.getTitle()));
        map.put("contentPreview", buildContentPreview(c.getContent()));
        map.put("questionType", c.getQuestionType() != null ? c.getQuestionType() : "SINGLE_CHOICE");
        map.put("difficulty", c.getDifficulty() != null ? c.getDifficulty() : "MEDIUM");
        map.put("courseId", c.getCourseId());
        map.put("course", courseSummary(courses.get(c.getCourseId())));
        map.put("moduleId", c.getModuleId());
        map.put("module", moduleSummary(modules.get(c.getModuleId())));
        map.put("contributorId", c.getUserId());
        map.put("contributor", contributorSummary(contributors.get(c.getUserId())));
        map.put("status", c.getStatus());
        map.put("resubmissionCount", c.getResubmissionCount());
        map.put("submittedAt", c.getSubmittedAt() != null ? c.getSubmittedAt() : Instant.now());
        map.put("reviewedAt", c.getReviewedAt());
        map.put("version", c.getVersion() != null ? c.getVersion() : 0L);
        map.put("canReview", canReview(c, manager));
        return map;
    }

    private Map<String, Object> toPageResponse(Page<?> pageResult, List<Map<String, Object>> content) {
        Map<String, Object> data = new HashMap<>();
        data.put("content", content);
        data.put("page", pageResult.getNumber());
        data.put("size", pageResult.getSize());
        data.put("totalElements", pageResult.getTotalElements());
        data.put("totalPages", pageResult.getTotalPages());
        data.put("first", pageResult.isFirst());
        data.put("last", pageResult.isLast());
        return data;
    }

    private Map<String, Object> toHistoryItem(ReviewLog log) {
        Map<String, Object> item = new HashMap<>();
        item.put("decision", log.getDecision());
        item.put("note", defaultString(log.getNote()));
        item.put("reviewer", Map.of("id", log.getReviewerId()));
        item.put("createdAt", log.getCreatedAt());
        return item;
    }

    private Object resolveAnswerKey(QuestionContribution c) {
        Object answerKey = readJson(c.getAnswerKeyJson(), new TypeReference<Object>() {});
        if ("ORDERING".equals(c.getQuestionType())
                && !(answerKey instanceof Map<?, ?> answerKeyMap && answerKeyMap.containsKey("correctOrder"))) {
            List<Object> legacyOrder = readJson(c.getCategoryIds(), new TypeReference<List<Object>>() {});
            if (legacyOrder != null) {
                return Map.of("correctOrder", legacyOrder);
            }
        }
        return answerKey;
    }

    private <T> T readJson(String value, TypeReference<T> type) {
        if (value == null || value.isBlank()) {
            return null;
        }
        try {
            return objectMapper.readValue(value, type);
        } catch (Exception ex) {
            throw new BadRequestException("Invalid stored contribution data.");
        }
    }

    private boolean canReview(QuestionContribution c, User manager) {
        return "PENDING".equalsIgnoreCase(c.getStatus()) && !c.getUserId().equals(manager.getUserId());
    }

    private String buildContentPreview(String content) {
        if (content == null) {
            return "";
        }
        if (content.length() > PREVIEW_MAX_LENGTH) {
            return content.substring(0, PREVIEW_MAX_LENGTH) + "...";
        }
        return content;
    }

    private String defaultString(String value) {
        return value != null ? value : "";
    }

    private Map<String, Object> courseSummary(Course course) {
        if (course == null) {
            return null;
        }
        return Map.of("id", course.getCourseId(), "courseId", course.getCourseId(), "title", course.getTitle());
    }

    private Map<String, Object> moduleSummary(com.examprep.entities.Module module) {
        if (module == null) {
            return null;
        }
        return Map.of("moduleId", module.getModuleId(), "title", module.getTitle());
    }

    private Map<String, Object> contributorSummary(User user) {
        if (user == null) {
            return null;
        }
        return Map.of("userId", user.getUserId(), "displayName", user.getFullName());
    }
}
