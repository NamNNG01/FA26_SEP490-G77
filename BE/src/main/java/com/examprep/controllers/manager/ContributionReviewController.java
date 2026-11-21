package com.examprep.controllers.manager;

import com.examprep.dto.ApiResponse;
import com.examprep.dto.question.CodeConfigDto;
import com.examprep.dto.question.TestCaseDto;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.examprep.entities.QuestionContribution;
import com.examprep.entities.ReviewLog;
import com.examprep.entities.User;
import com.examprep.repositories.ReviewLogRepository;
import com.examprep.repositories.CourseRepository;
import com.examprep.repositories.ModuleRepository;
import com.examprep.repositories.UserRepository;
import com.examprep.security.UserPrincipal;
import com.examprep.services.manager.review.ContributionReviewService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/v1/manager/contributions")
@RequiredArgsConstructor
@PreAuthorize("hasAnyRole('COURSE_MANAGER', 'ADMIN')")
@Tag(name = "Manager Contribution Review", description = "Manager review for student contributed questions")
public class ContributionReviewController {

    private final ContributionReviewService service;
    private final UserRepository userRepository;
    private final CourseRepository courseRepository;
    private final ModuleRepository moduleRepository;
    private final ReviewLogRepository reviewLogRepository;
    private final ObjectMapper objectMapper;

    private User getUser(UserPrincipal principal) {
        return userRepository.findById(principal.getId())
                .orElseThrow(() -> new com.examprep.exceptions.ResourceNotFoundException("User not found"));
    }

    @GetMapping
    @Operation(summary = "List contributed questions")
    public ResponseEntity<ApiResponse<Map<String, Object>>> list(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(required = false) Long courseId,
            @RequestParam(required = false) Long moduleId,
            @RequestParam(required = false) String questionType,
            @RequestParam(required = false) String difficulty,
            @RequestParam(required = false, defaultValue = "PENDING") String status,
            @RequestParam(required = false) Long contributorId,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) Instant submittedFrom,
            @RequestParam(required = false) Instant submittedTo,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(defaultValue = "submittedAt,desc") String sort) {
        if (size > 100) {
            size = 100;
        }
        String[] sortParts = sort.split(",");
        Sort.Direction direction = sortParts.length > 1 && "desc".equalsIgnoreCase(sortParts[1]) ? Sort.Direction.DESC : Sort.Direction.ASC;
        String sortField = sortParts[0];
        Pageable pageable = PageRequest.of(page, size, Sort.by(direction, sortField));

        User manager = getUser(principal);
        Page<QuestionContribution> pageResult = service.listContributions(manager, courseId, moduleId, questionType, difficulty, status, contributorId, keyword, submittedFrom, submittedTo, pageable);
        Map<Long, com.examprep.entities.Course> courses = courseRepository.findAllById(pageResult.getContent().stream()
                        .map(QuestionContribution::getCourseId).filter(java.util.Objects::nonNull).collect(Collectors.toSet()))
                .stream().collect(Collectors.toMap(com.examprep.entities.Course::getCourseId, Function.identity()));
        Map<Long, com.examprep.entities.Module> modules = moduleRepository.findAllById(pageResult.getContent().stream()
                        .map(QuestionContribution::getModuleId).filter(java.util.Objects::nonNull).collect(Collectors.toSet()))
                .stream().collect(Collectors.toMap(com.examprep.entities.Module::getModuleId, Function.identity()));
        Map<Long, User> contributors = userRepository.findAllById(pageResult.getContent().stream()
                        .map(QuestionContribution::getUserId).filter(java.util.Objects::nonNull).collect(Collectors.toSet()))
                .stream().collect(Collectors.toMap(User::getUserId, Function.identity()));

        List<Map<String, Object>> content = pageResult.getContent().stream().map(c -> {
            String preview = c.getContent();
            if (preview != null && preview.length() > 120) {
                preview = preview.substring(0, 120) + "...";
            }
            boolean canReview = "PENDING".equalsIgnoreCase(c.getStatus()) && !c.getUserId().equals(manager.getUserId());
            Map<String, Object> map = new LinkedHashMap<>();
            map.put("contributionId", c.getContributionId());
            map.put("title", c.getTitle() != null ? c.getTitle() : "");
            map.put("contentPreview", preview != null ? preview : "");
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
            map.put("reviewedAt", c.getReviewedAt() != null ? c.getReviewedAt() : null);
            map.put("version", c.getVersion() != null ? c.getVersion() : 0L);
            map.put("canReview", canReview);
            return (Map<String, Object>) map;
        }).toList();

        Map<String, Object> data = new HashMap<>();
        data.put("content", content);
        data.put("page", pageResult.getNumber());
        data.put("size", pageResult.getSize());
        data.put("totalElements", pageResult.getTotalElements());
        data.put("totalPages", pageResult.getTotalPages());
        data.put("first", pageResult.isFirst());
        data.put("last", pageResult.isLast());

        return ResponseEntity.ok(ApiResponse.success(data));
    }

    @GetMapping("/{id}")
    @Operation(summary = "Get contribution detail")
    public ResponseEntity<ApiResponse<Map<String, Object>>> detail(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable Long id) {
        User manager = getUser(principal);
        QuestionContribution c = service.getContributionDetail(manager, id);

        List<ReviewLog> logs = reviewLogRepository.findByTargetTypeAndTargetIdOrderByCreatedAtDesc("QUESTION_CONTRIBUTION", id);
        List<Map<String, Object>> history = logs.stream().map(l -> {
            Map<String, Object> hm = new HashMap<>();
            hm.put("decision", l.getDecision());
            hm.put("note", l.getNote() != null ? l.getNote() : "");
            hm.put("reviewer", Map.of("id", l.getReviewerId()));
            hm.put("createdAt", l.getCreatedAt());
            return hm;
        }).toList();

        boolean canReview = "PENDING".equalsIgnoreCase(c.getStatus()) && !c.getUserId().equals(manager.getUserId());

        Map<String, Object> data = new HashMap<>();
        data.put("contributionId", c.getContributionId());
        data.put("courseId", c.getCourseId());
        data.put("course", courseSummary(courseRepository.findById(c.getCourseId()).orElse(null)));
        data.put("contributorId", c.getUserId());
        data.put("contributor", contributorSummary(userRepository.findById(c.getUserId()).orElse(null)));
        data.put("type", c.getType());
        data.put("status", c.getStatus());
        data.put("title", c.getTitle() != null ? c.getTitle() : "");
        data.put("content", c.getContent());
        data.put("moduleId", c.getModuleId() != null ? c.getModuleId() : null);
        data.put("module", moduleSummary(c.getModuleId() == null
                ? null : moduleRepository.findById(c.getModuleId()).orElse(null)));
        data.put("groupId", c.getGroupId() != null ? c.getGroupId() : null);
        data.put("questionType", c.getQuestionType() != null ? c.getQuestionType() : "");
        data.put("options", c.getOptionsJson() == null ? List.of() : readJson(c.getOptionsJson(), new TypeReference<Object>() {}));
        Object answerKey = readJson(c.getAnswerKeyJson(), new TypeReference<Object>() {});
        if ("ORDERING".equals(c.getQuestionType()) && answerKey instanceof Map<?, ?> answerKeyMap
                && answerKeyMap.containsKey("correctOrder")) {
            answerKey = Map.of("correctOrder", readJson(c.getCategoryIds(), new TypeReference<List<Object>>() {}));
        }
        data.put("answerKey", answerKey);
        data.put("explanation", c.getExplanation() != null ? c.getExplanation() : "");
        data.put("difficulty", c.getDifficulty() != null ? c.getDifficulty() : "MEDIUM");
        data.put("essayGradingRubric", readJson(c.getEssayGradingRubricJson(), new TypeReference<Object>() {}));
        data.put("questionMetadata", readJson(c.getQuestionMetadataJson(), new TypeReference<Object>() {}));
        data.put("codeConfig", readJson(c.getCodeConfigJson(), new TypeReference<CodeConfigDto>() {}));
        data.put("testCases", readJson(c.getTestCasesJson(), new TypeReference<List<TestCaseDto>>() {}));
        data.put("sourceReference", c.getSourceReference() != null ? c.getSourceReference() : "");
        data.put("reviewNote", c.getReviewNote() != null ? c.getReviewNote() : "");
        data.put("resubmissionCount", c.getResubmissionCount());
        data.put("createdAt", c.getSubmittedAt());
        data.put("reviewedAt", c.getReviewedAt() != null ? c.getReviewedAt() : null);
        data.put("history", history);
        data.put("canReview", canReview);
        data.put("version", c.getVersion() != null ? c.getVersion() : 0L);

        return ResponseEntity.ok(ApiResponse.success(data));
    }

    private <T> T readJson(String value, TypeReference<T> type) {
        if (value == null || value.isBlank()) return null;
        try {
            return objectMapper.readValue(value, type);
        } catch (Exception ex) {
            throw new com.examprep.exceptions.BadRequestException("Invalid stored contribution data.");
        }
    }

    private Map<String, Object> courseSummary(com.examprep.entities.Course course) {
        if (course == null) return null;
        return Map.of("courseId", course.getCourseId(), "title", course.getTitle());
    }

    private Map<String, Object> moduleSummary(com.examprep.entities.Module module) {
        if (module == null) return null;
        return Map.of("moduleId", module.getModuleId(), "title", module.getTitle());
    }

    private Map<String, Object> contributorSummary(User user) {
        if (user == null) return null;
        return Map.of("userId", user.getUserId(), "displayName", user.getFullName());
    }

    @PostMapping("/{id}/approve")
    @Operation(summary = "Approve contribution")
    public ResponseEntity<ApiResponse<Map<String, Object>>> approve(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable Long id,
            @RequestBody Map<String, Object> body) {
        User manager = getUser(principal);
        Long version = body.get("version") instanceof Number n ? n.longValue() : null;
        String note = (String) body.get("note");
        Map<String, Object> result = service.approve(manager, id, version, note);
        return ResponseEntity.ok(ApiResponse.success(result, "Đã duyệt câu hỏi."));
    }

    @PostMapping("/{id}/reject")
    @Operation(summary = "Reject contribution")
    public ResponseEntity<ApiResponse<Map<String, Object>>> reject(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable Long id,
            @RequestBody Map<String, Object> body) {
        User manager = getUser(principal);
        Long version = body.get("version") instanceof Number n ? n.longValue() : null;
        String reason = (String) body.get("reason");
        Map<String, Object> result = service.reject(manager, id, version, reason);
        return ResponseEntity.ok(ApiResponse.success(result, "Đã từ chối câu hỏi."));
    }

    @GetMapping("/stats")
    @Operation(summary = "Contribution stats")
    public ResponseEntity<ApiResponse<Map<String, Object>>> stats(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(required = false) Long courseId) {
        User manager = getUser(principal);
        Map<String, Object> data = service.stats(manager, courseId);
        return ResponseEntity.ok(ApiResponse.success(data));
    }
}
