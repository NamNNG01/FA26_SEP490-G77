package com.examprep.services;

import com.examprep.dto.*;
import com.examprep.entities.*;
import com.examprep.entities.Module;
import com.examprep.exceptions.BadRequestException;
import com.examprep.exceptions.BaseException;
import com.examprep.exceptions.ResourceNotFoundException;
import com.examprep.repositories.*;
import com.examprep.security.UserPrincipal;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.text.Normalizer;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class CourseServiceImpl implements CourseService {
    private final CourseRepository courses;
    private final CourseManagerRepository assignments;
    private final ModuleRepository modules;
    private final EnrollmentRepository enrollments;
    private final QuestionRepository questions;
    private final ExamRepository exams;
    private final ExamConfigRepository configs;
    private final QuestionGroupRepository groups;
    private final DocumentRepository documents;
    private final AiUsageLogRepository aiLogs;
    private final CategoryRepository categories;
    private final CategoryService categoryService;
    private final UserRepository users;

    @Override
    public PageResponse<CourseResponse> list(UserPrincipal user, String search, Long categoryId, Boolean published,
                                             int page, int size, String sort) {
        if (categoryId != null) positiveId(categoryId);
        Page<Course> result = courses.findManagedCourses(admin(user) ? null : user.getId(), categoryId, published,
                searchPattern(search), paging(page, size, courseSort(sort)));
        List<Long> ids = result.getContent().stream().map(Course::getCourseId).toList();
        if (ids.isEmpty()) return PageResponse.of(result, List.of());
        Map<Long, Long> moduleCounts = counts(modules.countByCourses(ids));
        Map<Long, Long> studentCounts = counts(enrollments.countByCourses(ids));
        Map<Long, Long> examCounts = counts(exams.countByCourses(ids));
        return PageResponse.of(result, result.getContent().stream().map(c -> response(c,
                moduleCounts.getOrDefault(c.getCourseId(), 0L), studentCounts.getOrDefault(c.getCourseId(), 0L),
                examCounts.getOrDefault(c.getCourseId(), 0L), null)).toList());
    }

    @Override
    public CourseResponse detail(UserPrincipal user, Long id) {
        Course course = readCourse(id);
        checkAccess(user, course);
        return detailResponse(course);
    }

    @Override
    @Transactional
    @PreAuthorize("hasRole('ADMIN')")
    public CourseResponse create(CourseRequests.Create request) {
        Category category = category(request.categoryId());
        User manager = manager(request.managerId());
        Course course = Course.builder().title(request.title().strip()).categoryId(category.getCategoryId())
                .category(category).manager(manager).description(optionalText(request.description()))
                .thumbnailUrl(optionalText(request.thumbnailUrl()))
                .price(request.price() == null ? BigDecimal.ZERO : request.price()).isPublished(false)
                .slug("pending-" + UUID.randomUUID()).build();
        courses.saveAndFlush(course);
        course.setSlug(slug(course.getTitle(), course.getCourseId()));
        assignments.save(CourseManager.builder().course(course).user(manager).build());
        courses.flush();
        return detailResponse(course);
    }

    @Override
    @Transactional
    public CourseResponse update(UserPrincipal user, Long id, CourseRequests.Update request) {
        Course course = writeCourse(id);
        checkAccess(user, course);
        if (request.title() != null) course.setTitle(request.title().strip());
        if (request.description() != null) course.setDescription(optionalText(request.description()));
        if (request.thumbnailUrl() != null) course.setThumbnailUrl(optionalText(request.thumbnailUrl()));
        if (request.categoryId() != null) {
            Category category = category(request.categoryId());
            course.setCategoryId(category.getCategoryId());
            course.setCategory(category);
        }
        if (admin(user)) {
            if (request.price() != null) {
                BigDecimal price = request.price();
                if (price.signum() < 0 || price.compareTo(new BigDecimal("99999999.99")) > 0 || price.scale() > 2)
                    throw new BadRequestException("Price must be between 0 and 99999999.99 with at most two decimal places.");
                course.setPrice(price);
            }
            if (request.managerId() != null) {
                User replacement = manager(request.managerId());
                Long previousId = course.getManager().getUserId();
                if (!previousId.equals(replacement.getUserId())) {
                    assignments.deleteByCourseCourseIdAndUserUserId(id, previousId);
                    course.setManager(replacement);
                }
                if (!assignments.existsByCourseCourseIdAndUserUserId(id, replacement.getUserId()))
                    assignments.save(CourseManager.builder().course(course).user(replacement).build());
            }
        }
        courses.flush();
        return detailResponse(course);
    }

    @Override
    @Transactional
    @PreAuthorize("hasRole('ADMIN')")
    public CourseResponse publish(Long id, CourseRequests.Publish request) {
        Course course = writeCourse(id);
        if (request.isPublished() && modules.countByCourseCourseId(id) == 0)
            throw new BadRequestException("Add at least one module before publishing the course.");
        course.setIsPublished(request.isPublished());
        courses.flush();
        return detailResponse(course);
    }

    @Override
    @Transactional
    @PreAuthorize("hasRole('ADMIN')")
    public void deleteCourse(Long id) {
        Course course = writeCourse(id);
        if (enrollments.existsByCourseCourseId(id)
                || exams.existsByCourseCourseIdOrModuleCourseCourseId(id, id)
                || questions.existsByCourseCourseIdOrModuleCourseCourseId(id, id)
                || documents.existsByCourseCourseId(id)
                || aiLogs.existsByCourseCourseId(id)
                || configs.existsByModuleCourseCourseId(id)
                || groups.existsByCourseCourseIdOrModuleCourseCourseId(id, id))
            throw conflict("Course has enrollments or dependent content. Unpublish it instead.");
        assignments.deleteByCourseCourseId(id);
        modules.deleteByCourseCourseId(id);
        courses.delete(course);
        courses.flush();
    }

    @Override
    public List<ModuleResponse> modules(UserPrincipal user, Long courseId) {
        Course course = readCourse(courseId);
        checkAccess(user, course);
        return moduleResponses(courseId);
    }

    @Override
    @Transactional
    public ModuleResponse createModule(UserPrincipal user, Long courseId, CourseRequests.CreateModule request) {
        Course course = writeCourse(courseId);
        checkAccess(user, course);
        int order;
        if (request.orderIndex() == null) {
            int max = modules.maxOrder(courseId);
            if (max == Integer.MAX_VALUE) throw conflict("Module order limit reached.");
            order = Math.max(0, max) + 1;
        } else order = request.orderIndex();
        Module module = modules.save(Module.builder().course(course).title(request.title().strip())
                .description(optionalText(request.description())).orderIndex(order).build());
        course.setUpdatedAt(Instant.now());
        modules.flush();
        return moduleResponse(module, 0, 0);
    }

    @Override
    @Transactional
    public ModuleResponse updateModule(UserPrincipal user, Long id, CourseRequests.UpdateModule request) {
        Module module = writeModule(user, id);
        if (request.title() != null) module.setTitle(request.title().strip());
        if (request.description() != null) module.setDescription(optionalText(request.description()));
        if (request.orderIndex() != null) module.setOrderIndex(request.orderIndex());
        module.getCourse().setUpdatedAt(Instant.now());
        modules.flush();
        List<Long> ids = List.of(id);
        return moduleResponse(module, counts(questions.countByModules(ids)).getOrDefault(id, 0L),
                counts(exams.countByModules(ids)).getOrDefault(id, 0L));
    }

    @Override
    @Transactional
    public void deleteModule(UserPrincipal user, Long id) {
        Module module = writeModule(user, id);
        Course course = module.getCourse();
        if (questions.existsByModuleModuleId(id) || exams.existsByModuleModuleId(id)
                || configs.existsByModuleModuleId(id) || groups.existsByModuleModuleId(id))
            throw conflict("Module has dependent content. Remove or reassign it explicitly before deleting.");
        if (Boolean.TRUE.equals(course.getIsPublished()) && modules.countByCourseCourseId(course.getCourseId()) == 1)
            throw conflict("Unpublish the course before deleting its last module.");
        modules.delete(module);
        course.setUpdatedAt(Instant.now());
        modules.flush();
    }

    @Override
    public PageResponse<CourseStudentResponse> students(UserPrincipal user, Long courseId, String search, String status, int page, int size) {
        Course course = readCourse(courseId);
        checkAccess(user, course);
        if (status != null && !Set.of(Enrollment.STATUS_ACTIVE, Enrollment.STATUS_COMPLETED).contains(status))
            throw new BadRequestException("Status must be ACTIVE or COMPLETED.");
        Page<Enrollment> result = enrollments.findStudents(courseId, status, searchPattern(search),
                paging(page, size, Sort.by(Sort.Direction.DESC, "enrolledAt", "enrollmentId")));
        return PageResponse.of(result, result.getContent().stream().map(e -> new CourseStudentResponse(
                e.getUser().getUserId(), e.getUser().getFullName(), e.getUser().getEmail(), e.getUser().getAvatarUrl(),
                e.getEnrolledAt(), e.getStatus(), e.getProgress())).toList());
    }

    @Override
    public List<CategoryResponse> categories() {
        return categoryService.list();
    }

    private Course readCourse(Long id) {
        positiveId(id);
        return courses.findDetail(id).orElseThrow(() -> new ResourceNotFoundException("Course not found."));
    }

    private Course writeCourse(Long id) {
        positiveId(id);
        return courses.findForUpdate(id).orElseThrow(() -> new ResourceNotFoundException("Course not found."));
    }

    private Module writeModule(UserPrincipal user, Long id) {
        positiveId(id);
        Long courseId = modules.findCourseId(id).orElseThrow(() -> new ResourceNotFoundException("Module not found."));
        Course course = writeCourse(courseId);
        checkAccess(user, course);
        return modules.findForUpdate(id).orElseThrow(() -> new ResourceNotFoundException("Module not found."));
    }

    private void checkAccess(UserPrincipal user, Course course) {
        if (!admin(user) && (!User.ROLE_COURSE_MANAGER.equals(user.getRole())
                || (!course.getManager().getUserId().equals(user.getId())
                && !assignments.existsByCourseCourseIdAndUserUserId(course.getCourseId(), user.getId()))))
            throw new BaseException(ResponseCode.FORBIDDEN);
    }

    private boolean admin(UserPrincipal user) { return User.ROLE_ADMIN.equals(user.getRole()); }

    private Category category(Long id) {
        positiveId(id);
        return categories.findById(id).orElseThrow(() -> new ResourceNotFoundException("Category not found."));
    }

    private User manager(Long id) {
        positiveId(id);
        User manager = users.findById(id).orElseThrow(() -> new ResourceNotFoundException("Manager not found."));
        if (!User.ROLE_COURSE_MANAGER.equals(manager.getRoleName()) || !User.STATUS_ACTIVE.equals(manager.getStatus()))
            throw new BadRequestException("Manager must be an ACTIVE COURSE_MANAGER.");
        return manager;
    }

    private CourseResponse detailResponse(Course course) {
        List<ModuleResponse> content = moduleResponses(course.getCourseId());
        List<Long> ids = List.of(course.getCourseId());
        return response(course, content.size(), counts(enrollments.countByCourses(ids)).getOrDefault(course.getCourseId(), 0L),
                counts(exams.countByCourses(ids)).getOrDefault(course.getCourseId(), 0L), content);
    }

    private CourseResponse response(Course course, long moduleCount, long studentCount, long examCount, List<ModuleResponse> content) {
        return new CourseResponse(course.getCourseId(), course.getTitle(), course.getSlug(), course.getCategoryId(),
                course.getCategory().getName(), course.getManager().getUserId(), course.getManager().getFullName(),
                course.getThumbnailUrl(), course.getPrice(), course.getIsPublished(), moduleCount, studentCount, examCount,
                course.getCreatedAt(), course.getUpdatedAt(), content == null ? null : course.getDescription(), content);
    }

    private List<ModuleResponse> moduleResponses(Long courseId) {
        List<Module> content = modules.findByCourseCourseIdOrderByOrderIndexAscModuleIdAsc(courseId);
        if (content.isEmpty()) return List.of();
        List<Long> ids = content.stream().map(Module::getModuleId).toList();
        Map<Long, Long> questionCounts = counts(questions.countByModules(ids));
        Map<Long, Long> examCounts = counts(exams.countByModules(ids));
        return content.stream().map(m -> moduleResponse(m, questionCounts.getOrDefault(m.getModuleId(), 0L),
                examCounts.getOrDefault(m.getModuleId(), 0L))).toList();
    }

    private ModuleResponse moduleResponse(Module module, long questionCount, long examCount) {
        return new ModuleResponse(module.getModuleId(), module.getCourse().getCourseId(), module.getTitle(),
                module.getDescription(), module.getOrderIndex(), questionCount, examCount);
    }

    private Map<Long, Long> counts(List<IdCount> values) {
        return values.stream().collect(Collectors.toMap(IdCount::id, IdCount::total));
    }

    private String optionalText(String value) { return value == null || value.isBlank() ? null : value.strip(); }

    private String searchPattern(String value) {
        String text = value == null ? "" : value.strip().toLowerCase(Locale.ROOT);
        return "%" + text.replace("!", "!!").replace("%", "!%").replace("_", "!_") + "%";
    }

    private PageRequest paging(int page, int size, Sort sort) {
        if (page < 0 || size < 1 || size > 100 || (long) page * size > Integer.MAX_VALUE)
            throw new BadRequestException("Page must be nonnegative, size must be 1-100, and offset must fit a 32-bit integer.");
        return PageRequest.of(page, size, sort);
    }

    private Sort courseSort(String value) {
        String[] parts = value.split(",", -1);
        if (parts.length != 2 || !Set.of("courseId", "title", "price", "isPublished", "createdAt", "updatedAt").contains(parts[0])
                || !(parts[1].equalsIgnoreCase("asc") || parts[1].equalsIgnoreCase("desc")))
            throw new BadRequestException("Invalid course sort. Use an allowed field and asc or desc.");
        Sort sort = Sort.by(Sort.Direction.fromString(parts[1]), parts[0]);
        return parts[0].equals("courseId") ? sort : sort.and(Sort.by("courseId"));
    }

    private String slug(String title, Long id) {
        String base = Normalizer.normalize(title, Normalizer.Form.NFD).replaceAll("\\p{M}+", "")
                .toLowerCase(Locale.ROOT).replace('đ', 'd').replaceAll("[^a-z0-9]+", "-").replaceAll("^-|-$", "");
        if (base.isEmpty()) base = "course";
        String suffix = "-" + id;
        base = base.substring(0, Math.min(base.length(), 255 - suffix.length())).replaceAll("-+$", "");
        return base + suffix;
    }

    private void positiveId(Long id) {
        if (id == null || id <= 0) throw new BadRequestException("ID must be a positive integer.");
    }

    private BaseException conflict(String message) { return new BaseException(ResponseCode.CONFLICT, message); }
}
