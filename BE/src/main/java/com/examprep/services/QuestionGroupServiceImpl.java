package com.examprep.services;

import com.examprep.dto.PageResponse;
import com.examprep.dto.QuestionGroupCreateRequest;
import com.examprep.dto.QuestionGroupResponse;
import com.examprep.dto.QuestionGroupUpdateRequest;
import com.examprep.dto.ResponseCode;
import com.examprep.entities.Course;
import com.examprep.entities.Module;
import com.examprep.entities.QuestionGroup;
import com.examprep.entities.User;
import com.examprep.exceptions.BadRequestException;
import com.examprep.exceptions.ForbiddenException;
import com.examprep.exceptions.ResourceConflictException;
import com.examprep.exceptions.ResourceNotFoundException;
import com.examprep.repositories.CourseRepository;
import com.examprep.repositories.ExamGroupRepository;
import com.examprep.repositories.ExamQuestionRepository;
import com.examprep.repositories.ModuleRepository;
import com.examprep.repositories.QuestionGroupRepository;
import jakarta.persistence.criteria.Join;
import jakarta.persistence.criteria.JoinType;
import jakarta.persistence.criteria.Predicate;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class QuestionGroupServiceImpl implements QuestionGroupService {

    private static final String EXAM_STATUS_PUBLISHED = "PUBLISHED";
    private static final String ROLE_PREFIX = "ROLE_";
    private static final int DEFAULT_PAGE_SIZE = 20;
    private static final int MAX_PAGE_SIZE = 100;
    private static final char LIKE_ESCAPE_CHAR = '\\';

    private final QuestionGroupRepository questionGroupRepository;
    private final QuestionRepository questionRepository;
    private final ExamGroupRepository examGroupRepository;
    private final ExamQuestionRepository examQuestionRepository;
    private final CourseRepository courseRepository;
    private final ModuleRepository moduleRepository;

    @Override
    @Transactional(readOnly = true)
    public PageResponse<QuestionGroupResponse> getQuestionGroups(Long currentUserId, String currentUserRole,
                                                                Long courseId, Long moduleId, String search,
                                                                int page, int size) {
        boolean admin = isAdmin(currentUserRole);
        if (courseId != null && !admin && courseRepository.countOwnedCourse(courseId, currentUserId) == 0) {
            throw new ForbiddenException("You do not have access to this course.");
        }

        Specification<QuestionGroup> specification =
                buildSpecification(admin ? null : currentUserId, courseId, moduleId, normaliseSearch(search));
        Pageable pageable = PageRequest.of(safePage(page), safeSize(size),
                Sort.by(Sort.Direction.DESC, "groupId"));

        Page<QuestionGroup> groups = questionGroupRepository.findAll(specification, pageable);
        List<QuestionGroupResponse> content = toResponses(groups.getContent());

        return PageResponse.of(groups, content);
    }

    @Override
    @Transactional
    public QuestionGroupResponse createQuestionGroup(Long currentUserId, String currentUserRole,
                                                     QuestionGroupCreateRequest request) {
        Course course = courseRepository.findById(request.getCourseId())
                .orElseThrow(() -> new ResourceNotFoundException(
                        "Course not found with id: " + request.getCourseId()));
        assertCourseAccess(course, currentUserId, currentUserRole);

        Module module = resolveModule(request.getModuleId(), course.getCourseId());

        String title = normaliseText(request.getTitle());
        String passageText = normaliseText(request.getPassageText());
        requireContent(title, passageText);

        QuestionGroup group = QuestionGroup.builder()
                .course(course)
                .module(module)
                .title(title)
                .passageText(passageText)
                .build();
        QuestionGroup saved = questionGroupRepository.save(group);

        log.info("Question group {} created for course {} by user {}",
                saved.getGroupId(), course.getCourseId(), currentUserId);
        return toResponse(saved, 0L);
    }

    @Override
    @Transactional
    public QuestionGroupResponse updateQuestionGroup(Long currentUserId, String currentUserRole,
                                                     Long groupId, QuestionGroupUpdateRequest request) {
        QuestionGroup group = findGroup(groupId);
        assertGroupAccess(group, currentUserId, currentUserRole);

        String title = request.getTitle() == null ? group.getTitle() : normaliseText(request.getTitle());
        String passageText = request.getPassageText() == null
                ? group.getPassageText()
                : normaliseText(request.getPassageText());
        requireContent(title, passageText);

        group.setTitle(title);
        group.setPassageText(passageText);
        QuestionGroup saved = questionGroupRepository.save(group);

        log.info("Question group {} updated by user {}", groupId, currentUserId);
        return toResponse(saved, countQuestions(groupId));
    }

    @Override
    @Transactional
    public void deleteQuestionGroup(Long currentUserId, String currentUserRole, Long groupId) {
        QuestionGroup group = findGroup(groupId);
        assertGroupAccess(group, currentUserId, currentUserRole);

        long publishedExamGroupCount =
                examGroupRepository.countByGroupIdAndExamStatus(groupId, EXAM_STATUS_PUBLISHED);
        long publishedExamQuestionCount =
                examQuestionRepository.countByQuestionGroupIdAndExamStatus(groupId, EXAM_STATUS_PUBLISHED);
        if (publishedExamGroupCount > 0 || publishedExamQuestionCount > 0) {
            throw new ResourceConflictException("Question group is used by a published exam and cannot be deleted.");
        }

        examGroupRepository.deleteByGroupId(groupId);
        questionRepository.detachFromGroup(groupId);
        questionGroupRepository.delete(group);

        log.info("Question group {} deleted by user {}", groupId, currentUserId);
    }

    private Specification<QuestionGroup> buildSpecification(Long managerId, Long courseId, Long moduleId,
                                                            String search) {
        return (root, query, criteriaBuilder) -> {
            List<Predicate> predicates = new ArrayList<>();

            Join<QuestionGroup, Course> courseJoin = null;
            Join<QuestionGroup, Module> moduleJoin = null;
            Join<Module, Course> moduleCourseJoin = null;
            if (moduleId != null || courseId != null || managerId != null) {
                moduleJoin = root.join("module", JoinType.LEFT);
            }
            if (courseId != null || managerId != null) {
                courseJoin = root.join("course", JoinType.LEFT);
                moduleCourseJoin = moduleJoin.join("course", JoinType.LEFT);
            }

            if (courseId != null) {
                predicates.add(criteriaBuilder.or(
                        criteriaBuilder.equal(courseJoin.get("courseId"), courseId),
                        criteriaBuilder.equal(moduleCourseJoin.get("courseId"), courseId)));
            }
            if (moduleId != null) {
                predicates.add(criteriaBuilder.equal(moduleJoin.get("moduleId"), moduleId));
            }
            if (search != null) {
                String pattern = "%" + escapeLikePattern(search) + "%";
                predicates.add(criteriaBuilder.or(
                        criteriaBuilder.like(criteriaBuilder.lower(root.get("title")), pattern, LIKE_ESCAPE_CHAR),
                        criteriaBuilder.like(criteriaBuilder.lower(root.get("passageText")), pattern, LIKE_ESCAPE_CHAR)));
            }
            if (managerId != null) {
                predicates.add(criteriaBuilder.or(
                        criteriaBuilder.equal(courseJoin.get("manager").get("userId"), managerId),
                        criteriaBuilder.equal(moduleCourseJoin.get("manager").get("userId"), managerId)));
            }

            return criteriaBuilder.and(predicates.toArray(new Predicate[0]));
        };
    }

    private List<QuestionGroupResponse> toResponses(List<QuestionGroup> groups) {
        if (groups.isEmpty()) {
            return List.of();
        }

        List<Long> groupIds = groups.stream().map(QuestionGroup::getGroupId).toList();
        Map<Long, Long> questionCounts = new HashMap<>();
        for (Object[] row : questionRepository.countByGroupIds(groupIds)) {
            questionCounts.put((Long) row[0], ((Number) row[1]).longValue());
        }

        return groups.stream()
                .map(group -> toResponse(group, questionCounts.getOrDefault(group.getGroupId(), 0L)))
                .toList();
    }

    private QuestionGroupResponse toResponse(QuestionGroup group, long questionCount) {
        return QuestionGroupResponse.builder()
                .groupId(group.getGroupId())
                .courseId(resolveCourseId(group))
                .moduleId(group.getModule() == null ? null : group.getModule().getModuleId())
                .title(group.getTitle())
                .passageText(group.getPassageText())
                .questionCount(questionCount)
                .build();
    }

    private long countQuestions(Long groupId) {
        List<Object[]> rows = questionRepository.countByGroupIds(List.of(groupId));
        return rows.isEmpty() ? 0L : ((Number) rows.get(0)[1]).longValue();
    }

    private QuestionGroup findGroup(Long groupId) {
        return questionGroupRepository.findById(groupId)
                .orElseThrow(() -> new ResourceNotFoundException(
                        "Question group not found with id: " + groupId));
    }

    private Module resolveModule(Long moduleId, Long courseId) {
        if (moduleId == null) {
            return null;
        }

        Module module = moduleRepository.findById(moduleId)
                .orElseThrow(() -> new ResourceNotFoundException("Module not found with id: " + moduleId));
        if (!courseId.equals(module.getCourse().getCourseId())) {
            throw new ResourceNotFoundException(
                    "Module " + moduleId + " does not belong to course " + courseId);
        }
        return module;
    }

    private void assertCourseAccess(Course course, Long userId, String role) {
        if (isAdmin(role)) {
            return;
        }
        if (course.getManager() == null || !userId.equals(course.getManager().getUserId())) {
            throw new ForbiddenException("You do not have access to this course.");
        }
    }

    private void assertGroupAccess(QuestionGroup group, Long userId, String role) {
        if (isAdmin(role)) {
            return;
        }
        Long courseId = resolveCourseId(group);
        if (courseId == null || courseRepository.countOwnedCourse(courseId, userId) == 0) {
            throw new ForbiddenException("You do not have access to this question group.");
        }
    }

    private Long resolveCourseId(QuestionGroup group) {
        if (group.getCourse() != null) {
            return group.getCourse().getCourseId();
        }
        if (group.getModule() != null && group.getModule().getCourse() != null) {
            return group.getModule().getCourse().getCourseId();
        }
        return null;
    }

    private void requireContent(String title, String passageText) {
        if (title == null && passageText == null) {
            throw new BadRequestException(ResponseCode.VALIDATION_ERROR,
                    "Question group must have a title or a passage text.");
        }
    }

    private String normaliseText(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private String normaliseSearch(String search) {
        if (search == null) {
            return null;
        }
        String trimmed = search.trim();
        return trimmed.isEmpty() ? null : trimmed.toLowerCase();
    }

    private String escapeLikePattern(String value) {
        return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
    }

    private int safePage(int page) {
        return Math.max(page, 0);
    }

    private int safeSize(int size) {
        if (size <= 0) {
            return DEFAULT_PAGE_SIZE;
        }
        return Math.min(size, MAX_PAGE_SIZE);
    }

    private boolean isAdmin(String role) {
        if (role == null) {
            return false;
        }
        String roleName = role.startsWith(ROLE_PREFIX) ? role.substring(ROLE_PREFIX.length()) : role;
        return User.ROLE_ADMIN.equals(roleName);
    }
}
