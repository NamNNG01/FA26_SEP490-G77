package com.examprep.services.student;

import com.examprep.dto.student.*;
import com.examprep.entities.*;
import com.examprep.entities.Module;
import com.examprep.exceptions.BadRequestException;
import com.examprep.exceptions.ForbiddenException;
import com.examprep.exceptions.ResourceNotFoundException;
import com.examprep.repositories.*;
import com.examprep.util.QuestionTypeUtil;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class StudentCourseServiceImpl implements StudentCourseService {

    private final CourseRepository courseRepository;
    private final EnrollmentRepository enrollmentRepository;
    private final ModuleRepository moduleRepository;
    private final ExamRepository examRepository;
    private final DeckRepository deckRepository;
    private final FlashcardRepository flashcardRepository;
    private final UserCardProgressRepository userCardProgressRepository;

    @Override
    public Page<CourseCardDto> listCourses(Long categoryId, String keyword, String sort, int page, int size, Long userId) {
        Pageable pageable = createPageable(page, size, sort, "createdAt");
        String search = sanitizeSearch(keyword);
        return courseRepository.findPublishedCourses(categoryId, search, userId, pageable);
    }

    @Override
    public CourseDetailDto getCourseDetail(Long courseId, Long userId) {
        Course course = courseRepository.findDetail(courseId)
                .orElseThrow(() -> new ResourceNotFoundException("Course not found"));
        if (!Boolean.TRUE.equals(course.getIsPublished())) {
            throw new ResourceNotFoundException("Course not found");
        }

        List<Module> modules = moduleRepository.findVisibleModulesByCourseId(courseId);
        List<ModuleItemDto> moduleDtos = modules.stream()
                .map(m -> new ModuleItemDto(m.getModuleId(), m.getTitle(), m.getOrderIndex()))
                .toList();

        long publishedExamCount =
                examRepository.countPublishedExamsByCourseId(courseId);
        long deckCount = deckRepository.findCourseDecksWithStats(courseId, userId != null ? userId : 0L).size();

        EnrollmentSummaryDto enrollmentSummary;
        if (userId != null && enrollmentRepository.findByUser_UserIdAndCourse_CourseId(userId, courseId).isPresent()) {
            Enrollment en = enrollmentRepository.findByUser_UserIdAndCourse_CourseId(userId, courseId).get();
            enrollmentSummary = new EnrollmentSummaryDto(true, en.getStatus(), en.getProgress());
        } else {
            enrollmentSummary = new EnrollmentSummaryDto(false, null, null);
        }

        return new CourseDetailDto(
                course.getCourseId(),
                course.getTitle(),
                course.getSlug(),
                course.getDescription(),
                course.getThumbnailUrl(),
                course.getPrice(),
                new CategoryRefDto(course.getCategoryId(), course.getCategory() != null ? course.getCategory().getName() : null),
                new ManagerRefDto(course.getManager().getUserId(), course.getManager().getFullName()),
                moduleDtos,
                new CourseStatsDto(publishedExamCount, deckCount),
                enrollmentSummary
        );
    }

    @Override
    public Page<MyCourseDto> listMyCourses(String status, int page, int size, Long userId) {
        if (status != null && !status.equals("ACTIVE") && !status.equals("COMPLETED")) {
            throw new BadRequestException("Invalid enrollment status");
        }
        Pageable pageable = createPageable(page, size, "newest", "enrolledAt");
        return enrollmentRepository.findMyCourses(userId, status, pageable);
    }

    @Override
    public Page<CourseExamDto> listCourseExams(Long courseId, String sort, int page, int size, Long userId) {
        validateActiveEnrollment(courseId, userId);
        Pageable pageable = createPageable(page, size, sort, "publishedAt");
        Page<CourseExamDto> exams = examRepository.findCourseExamsWithStats(courseId, userId, pageable);
        if (exams.isEmpty()) {
            return exams;
        }
        List<Long> ids = exams.getContent().stream().map(CourseExamDto::examId).toList();
        Map<Long, Set<String>> kinds = new HashMap<>();
        for (List<Object[]> rows : List.of(examRepository.findQuestionTypesByExamIds(ids),
                examRepository.findConfigTypesByExamIds(ids))) {
            for (Object[] row : rows) {
                String kind = QuestionTypeUtil.examKindOf((String) row[1]);
                if (kind != null) {
                    kinds.computeIfAbsent((Long) row[0], k -> new HashSet<>()).add(kind);
                }
            }
        }
        return exams.map(e -> {
            Set<String> found = kinds.getOrDefault(e.examId(), Set.of());
            return e.withExamKind(found.isEmpty() ? null : found.size() > 1 ? "MIXED" : found.iterator().next());
        });
    }

    @Override
    public List<DeckDto> listCourseDecks(Long courseId, Long userId) {
        validateActiveEnrollment(courseId, userId);
        return deckRepository.findCourseDecksWithStats(courseId, userId);
    }

    @Override
    public Page<CardDto> listDeckCards(Long deckId, int page, int size, Long userId) {
        Deck deck = deckRepository.findById(deckId)
                .orElseThrow(() -> new ResourceNotFoundException("Deck not found"));
        boolean ownOrPublic = deck.getUser().getUserId().equals(userId) || "PUBLIC".equals(deck.getVisibility());
        if (ownOrPublic) {
            // Personal (FC-01) or approved public deck (FC-10).
        } else if (deck.getCourse() != null && !"STUDENT".equals(deck.getUser().getRoleName())) {
            validateActiveEnrollment(deck.getCourse().getCourseId(), userId);
        } else if (!Boolean.TRUE.equals(deck.getIsPublic()) && (deck.getUser() == null || !deck.getUser().getUserId().equals(userId))) {
            throw new ForbiddenException("Access denied to deck");
        }
        Pageable pageable = createPageable(page, size, "newest", "cardId");
        return flashcardRepository.findDeckCardsWithProgress(deckId, userId, pageable);
    }

    private void validateActiveEnrollment(Long courseId, Long userId) {
        if (userId == null) {
            throw new ForbiddenException("Authentication required");
        }
        boolean active = enrollmentRepository.existsByCourse_CourseIdAndUser_UserIdAndStatus(courseId, userId, "ACTIVE");
        if (!active) {
            throw new ForbiddenException("Student is not actively enrolled in this course");
        }
    }

    private String sanitizeSearch(String keyword) {
        if (keyword == null || keyword.trim().isEmpty()) {
            return null;
        }
        String trimmed = keyword.trim().toLowerCase(Locale.ROOT);
        if (trimmed.length() > 100) {
            trimmed = trimmed.substring(0, 100);
        }
        return "%" + trimmed.replace("!", "!!").replace("%", "!%").replace("_", "!_") + "%";
    }

    private Pageable createPageable(int page, int size, String sort, String defaultSortField) {
        if (page < 0) {
            throw new BadRequestException("Page index must not be less than zero");
        }
        if (size <= 0 || size > 100) {
            throw new BadRequestException("Page size must be between 1 and 100");
        }
        Sort springSort = Sort.by(Sort.Direction.DESC, defaultSortField);
        if ("title".equalsIgnoreCase(sort)) {
            springSort = Sort.by(Sort.Direction.ASC, "title");
        } else if ("newest".equalsIgnoreCase(sort)) {
            springSort = Sort.by(Sort.Direction.DESC, defaultSortField);
        } else if (sort != null && !sort.isEmpty()) {
            throw new BadRequestException("Invalid sort parameter");
        }
        return PageRequest.of(page, size, springSort);
    }
}
