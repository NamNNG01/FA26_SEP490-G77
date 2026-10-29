package com.examprep.services.student;

import com.examprep.dto.student.CourseProgressDto;
import com.examprep.dto.student.DeckDto;
import com.examprep.dto.student.StudentActivityDto;
import com.examprep.entities.ExamAttempt;
import com.examprep.exceptions.ForbiddenException;
import com.examprep.exceptions.ResourceNotFoundException;
import com.examprep.repositories.CourseRepository;
import com.examprep.repositories.DeckRepository;
import com.examprep.repositories.EnrollmentRepository;
import com.examprep.repositories.ExamAttemptRepository;
import com.examprep.repositories.ExamRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class StudentProgressServiceImpl implements StudentProgressService {

    private final CourseRepository courseRepository;
    private final EnrollmentRepository enrollmentRepository;
    private final ExamRepository examRepository;
    private final DeckRepository deckRepository;
    private final ExamAttemptRepository examAttemptRepository;

    @Override
    public CourseProgressDto getCourseProgress(Long courseId, Long userId) {
        if (!courseRepository.existsById(courseId)) {
            throw new ResourceNotFoundException("Course not found");
        }
        boolean active = enrollmentRepository.existsByCourse_CourseIdAndUser_UserIdAndStatus(courseId, userId, "ACTIVE");
        if (!active) {
            throw new ForbiddenException("Student is not actively enrolled in this course");
        }

        long totalExams = examRepository.countPublishedExamsByCourseId(courseId);
        List<DeckDto> decks = deckRepository.findCourseDecksWithStats(courseId, userId);
        long totalDecks = decks.size();
        long learnedDecks = decks.stream().filter(d -> d.cardCount() != null && d.cardCount() > 0 && d.learnedCount() != null && d.learnedCount() >= d.cardCount()).count();

        List<ExamAttempt> courseAttempts = examAttemptRepository.findAll().stream()
                .filter(a -> a.getUser().getUserId().equals(userId)
                        && a.getExam().getCourse() != null
                        && a.getExam().getCourse().getCourseId().equals(courseId))
                .toList();

        List<ExamAttempt> completedAttempts = courseAttempts.stream()
                .filter(a -> "COMPLETED".equals(a.getStatus()) && a.getTotalScore() != null && a.getExam().getMaxScore() != null && a.getExam().getMaxScore().compareTo(BigDecimal.ZERO) > 0)
                .toList();

        long completedExams = completedAttempts.stream().map(a -> a.getExam().getExamId()).distinct().count();

        BigDecimal averageScore = null;
        if (!completedAttempts.isEmpty()) {
            BigDecimal sum = BigDecimal.ZERO;
            for (ExamAttempt att : completedAttempts) {
                BigDecimal scoreRatio = att.getTotalScore().divide(att.getExam().getMaxScore(), 4, RoundingMode.HALF_UP);
                BigDecimal scaled = scoreRatio.multiply(BigDecimal.TEN);
                sum = sum.add(scaled);
            }
            averageScore = sum.divide(BigDecimal.valueOf(completedAttempts.size()), 2, RoundingMode.HALF_UP);
        }

        int totalItems = (int) (totalExams + totalDecks);
        int completedItems = (int) (completedExams + learnedDecks);
        int progress = totalItems > 0 ? (completedItems * 100) / totalItems : 0;
        if (progress > 100) progress = 100;

        List<ExamAttempt> sortedAttempts = courseAttempts.stream()
                .filter(a -> a.getSubmitTime() != null)
                .sorted(Comparator.comparing(ExamAttempt::getSubmitTime).reversed())
                .limit(5)
                .toList();

        List<CourseProgressDto.RecentAttemptItem> recentAttemptItems = sortedAttempts.stream()
                .map(a -> new CourseProgressDto.RecentAttemptItem(
                        a.getAttemptId(),
                        a.getExam().getTitle(),
                        a.getTotalScore(),
                        a.getExam().getMaxScore(),
                        a.getSubmitTime()
                ))
                .toList();

        return CourseProgressDto.builder()
                .courseId(courseId)
                .totalExams(totalExams)
                .completedExams(completedExams)
                .totalDecks(totalDecks)
                .learnedDecks(learnedDecks)
                .averageScore(averageScore)
                .progress(progress)
                .recentAttempts(recentAttemptItems)
                .build();
    }

    @Override
    public Page<StudentActivityDto> getActivityHistory(String type, int page, int size, Long userId) {
        Pageable pageable = PageRequest.of(page, size);
        List<StudentActivityDto> activities = new ArrayList<>();

        if (type == null || type.isEmpty() || "EXAM".equalsIgnoreCase(type) || "QUIZ".equalsIgnoreCase(type)) {
            List<ExamAttempt> attempts = examAttemptRepository.findAll().stream()
                    .filter(a -> a.getUser().getUserId().equals(userId) && a.getSubmitTime() != null)
                    .toList();
            for (ExamAttempt att : attempts) {
                activities.add(new StudentActivityDto(
                        "EXAM",
                        att.getAttemptId(),
                        att.getExam().getTitle(),
                        att.getTotalScore(),
                        att.getExam().getMaxScore(),
                        null,
                        null,
                        att.getSubmitTime()
                ));
            }
        }

        activities.sort(Comparator.comparing(StudentActivityDto::getHappenedAt, Comparator.nullsLast(Comparator.reverseOrder())));

        int start = (int) pageable.getOffset();
        int end = Math.min((start + pageable.getPageSize()), activities.size());
        List<StudentActivityDto> subList = start > activities.size() ? List.of() : activities.subList(start, end);

        return new PageImpl<>(subList, pageable, activities.size());
    }
}
