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
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
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

        long completedExams = examAttemptRepository.countCompletedExamsByUserAndCourse(userId, courseId);
        Double avgScoreVal = examAttemptRepository.averageScoreByUserAndCourse(userId, courseId);
        BigDecimal averageScore = avgScoreVal != null ? BigDecimal.valueOf(avgScoreVal).setScale(2, RoundingMode.HALF_UP) : null;

        int totalItems = (int) (totalExams + totalDecks);
        int completedItems = (int) (completedExams + learnedDecks);
        int progress = totalItems > 0 ? Math.min(100, (completedItems * 100) / totalItems) : 0;

        List<ExamAttempt> recentAttempts = examAttemptRepository.findRecentAttemptsByUserAndCourse(userId, courseId, PageRequest.of(0, 5));
        List<CourseProgressDto.RecentAttemptItem> recentAttemptItems = recentAttempts.stream()
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
    public int liveProgressPercent(Long userId, Long courseId) {
        long totalExams = examRepository.countPublishedExamsByCourseId(courseId);
        List<DeckDto> decks = deckRepository.findCourseDecksWithStats(courseId, userId);
        int totalItems = (int) (totalExams + decks.size());
        if (totalItems == 0) {
            return -1;
        }
        long completedExams = examAttemptRepository.countCompletedExamsByUserAndCourse(userId, courseId);
        long learnedDecks = decks.stream()
                .filter(d -> d.cardCount() != null && d.cardCount() > 0 && d.learnedCount() != null && d.learnedCount() >= d.cardCount())
                .count();
        int completedItems = (int) (completedExams + learnedDecks);
        return Math.min(100, (completedItems * 100) / totalItems);
    }

    @Override
    public Page<StudentActivityDto> getActivityHistory(String type, int page, int size, Long userId) {
        Pageable pageable = PageRequest.of(page, size);
        Page<ExamAttempt> attempts = examAttemptRepository.findActivityAttemptsByUser(userId, pageable);

        return attempts.map(att -> new StudentActivityDto(
                "EXAM",
                att.getAttemptId(),
                att.getExam() != null ? att.getExam().getTitle() : "Practice Exam",
                att.getTotalScore(),
                att.getExam() != null ? att.getExam().getMaxScore() : null,
                null,
                null,
                att.getSubmitTime()
        ));
    }
}
