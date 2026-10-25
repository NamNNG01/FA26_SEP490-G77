package com.examprep.services.student;

import com.examprep.dto.student.*;
import com.examprep.entities.*;
import com.examprep.exceptions.BadRequestException;
import com.examprep.exceptions.ForbiddenException;
import com.examprep.exceptions.ResourceNotFoundException;
import com.examprep.repositories.*;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class StudentExamServiceImpl implements StudentExamService {

    private final ExamRepository examRepository;
    private final EnrollmentRepository enrollmentRepository;
    private final ExamAttemptRepository examAttemptRepository;

    @Override
    public ExamDetailDto getExamDetail(Long examId, Long userId) {
        Exam exam = examRepository.findById(examId)
                .orElseThrow(() -> new ResourceNotFoundException("Exam not found"));
        if (!"PUBLISHED".equals(exam.getStatus())) {
            throw new ResourceNotFoundException("Exam not found");
        }
        if (exam.getCourse() != null) {
            validateActiveEnrollment(exam.getCourse().getCourseId(), userId);
        }

        List<QuestionTypeCountDto> typeSummaries = examRepository.getExamQuestionTypeSummaries(examId);
        int totalCount = typeSummaries.stream().mapToInt(QuestionTypeCountDto::count).sum();
        ExamQuestionsByTypeSummary questionsSummary = new ExamQuestionsByTypeSummary(typeSummaries, totalCount);

        List<ExamAttempt> attempts = examAttemptRepository.findAll().stream()
                .filter(a -> a.getExam().getExamId().equals(examId) && a.getUser().getUserId().equals(userId))
                .toList();

        long attemptCount = attempts.size();
        BigDecimal bestScore = attempts.stream()
                .map(ExamAttempt::getTotalScore)
                .filter(s -> s != null)
                .max(BigDecimal::compareTo)
                .orElse(null);
        String latestStatus = attempts.stream()
                .max((a1, a2) -> a1.getStartTime().compareTo(a2.getStartTime()))
                .map(ExamAttempt::getStatus)
                .orElse(null);

        ExamMyStatsDto myStats = new ExamMyStatsDto(attemptCount, bestScore, latestStatus);

        Optional<ExamAttempt> activeAttempt = examAttemptRepository.findActiveAttempt(examId, userId, "IN_PROGRESS");
        boolean canStart = attemptCount == 0 || activeAttempt.isPresent();
        boolean canResume = activeAttempt.isPresent();
        Long activeAttemptId = activeAttempt.map(ExamAttempt::getAttemptId).orElse(null);
        ExamActionsDto actions = new ExamActionsDto(canStart, canResume, activeAttemptId);

        return new ExamDetailDto(
                exam.getExamId(),
                exam.getCourse() != null ? exam.getCourse().getCourseId() : null,
                exam.getTitle(),
                exam.getDescription(),
                exam.getDurationMinutes(),
                exam.getIsPractice(),
                exam.getGenerationType(),
                exam.getMaxScore(),
                exam.getStatus(),
                questionsSummary,
                myStats,
                actions
        );
    }

    @Override
    public ActiveAttemptDto getActiveAttempt(Long examId, Long userId) {
        Exam exam = examRepository.findById(examId)
                .orElseThrow(() -> new ResourceNotFoundException("Exam not found"));
        if (!"PUBLISHED".equals(exam.getStatus())) {
            throw new ResourceNotFoundException("Exam not found");
        }
        if (exam.getCourse() != null) {
            validateActiveEnrollment(exam.getCourse().getCourseId(), userId);
        }

        ExamAttempt active = examAttemptRepository.findActiveAttempt(examId, userId, "IN_PROGRESS")
                .orElseThrow(() -> new ResourceNotFoundException("No active attempt found"));

        return new ActiveAttemptDto(
                active.getAttemptId(),
                active.getExam().getExamId(),
                active.getStartTime(),
                active.getDeadlineAt(),
                active.getStatus(),
                exam.getDurationMinutes(),
                exam.getMaxScore()
        );
    }

    @Override
    public Page<MyExamDto> listMyExams(int page, int size, Long userId) {
        if (page < 0) {
            throw new BadRequestException("Page index must not be less than zero");
        }
        if (size <= 0 || size > 100) {
            throw new BadRequestException("Page size must be between 1 and 100");
        }
        Pageable pageable = PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "startTime"));
        return examAttemptRepository.findMyExams(userId, pageable);
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
}
