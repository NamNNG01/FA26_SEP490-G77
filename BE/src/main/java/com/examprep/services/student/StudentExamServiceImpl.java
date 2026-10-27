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
import java.util.Comparator;
import java.util.List;
import java.util.Objects;
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

        if (!exam.isVisibleToStudents()) {
            throw new ResourceNotFoundException("Exam not found");
        }

        if (exam.getCourse() != null) {
            validateActiveEnrollment(exam.getCourse().getCourseId(), userId);
        }

        List<QuestionTypeCountDto> typeSummaries =
                examRepository.getExamQuestionTypeSummaries(examId);

        int totalCount = typeSummaries.stream()
                .mapToInt(QuestionTypeCountDto::count)
                .sum();

        List<ExamAttempt> attempts =
                examAttemptRepository.findByExam_ExamIdAndUser_UserId(examId, userId);

        long attemptCount = attempts.size();

        List<ExamAttempt> submittedAttempts = attempts.stream()
                .filter(a -> "SUBMITTED".equals(a.getStatus())||"COMPLETED".equals(a.getStatus()))
                .toList();

        BigDecimal bestScore = submittedAttempts.stream()
                .map(ExamAttempt::getTotalScore)
                .filter(Objects::nonNull)
                .max(BigDecimal::compareTo)
                .orElse(null);

        ExamAttempt lastSubmittedAttempt = submittedAttempts.stream()
                .filter(a -> a.getSubmittedAt() != null)
                .max(Comparator.comparing(ExamAttempt::getSubmittedAt))
                .orElse(null);

        ExamMyStatsDto myStats = new ExamMyStatsDto(
                attemptCount,
                bestScore,
                lastSubmittedAttempt != null
                        ? lastSubmittedAttempt.getSubmittedAt()
                        : null,
                lastSubmittedAttempt != null
                        ? lastSubmittedAttempt.getAttemptId()
                        : null
        );

        Optional<ExamAttempt> activeAttempt =
                examAttemptRepository.findActiveAttempt(examId, userId, "IN_PROGRESS");

        Long activeAttemptId = activeAttempt
                .map(ExamAttempt::getAttemptId)
                .orElse(null);

        boolean canViewHistory = attemptCount > 0;

        boolean canStart = totalCount > 0 && activeAttempt.isEmpty();

        String reason = null;
        if (totalCount == 0) {
            reason = "EXAM_HAS_NO_QUESTIONS";
        } else if (activeAttempt.isPresent()) {
            reason = "ACTIVE_ATTEMPT_EXISTS";
        }

        ExamActionsDto actions = new ExamActionsDto(
                canStart,
                activeAttemptId,
                canViewHistory,
                reason
        );

        return new ExamDetailDto(
                exam.getExamId(),
                exam.getCourse() != null ? exam.getCourse().getCourseId() : null,
                exam.getCourse() != null ? exam.getCourse().getTitle() : null,
                exam.getTitle(),
                exam.getDescription(),
                exam.getDurationMinutes(),
                exam.getMaxScore(),
                totalCount,
                exam.getPublishedAt(),
                myStats,
                actions
        );
    }

    @Override
    public ActiveAttemptDto getActiveAttempt(Long examId, Long userId) {
        Exam exam = examRepository.findById(examId)
                .orElseThrow(() -> new ResourceNotFoundException("Exam not found"));
        if (!exam.isVisibleToStudents()) {
            throw new ResourceNotFoundException("Exam not found");
        }
        if (exam.getCourse() != null) {
            validateActiveEnrollment(exam.getCourse().getCourseId(), userId);
        }

        Optional<ExamAttempt> activeAttempt =
                examAttemptRepository.findActiveAttempt(examId, userId, "IN_PROGRESS");

        if (activeAttempt.isEmpty()) {
            return null;
        }

        ExamAttempt active = activeAttempt.get();

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
        Pageable pageable = PageRequest.of(page, size);
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
