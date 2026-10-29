package com.examprep.services.student;

import com.examprep.dto.PageResponse;
import com.examprep.dto.ResponseCode;
import com.examprep.dto.student.PracticeDtos;
import com.examprep.dto.student.QuestionCandidate;
import com.examprep.entities.*;
import com.examprep.entities.Module;
import com.examprep.exceptions.BadRequestException;
import com.examprep.exceptions.BaseException;
import com.examprep.exceptions.ForbiddenException;
import com.examprep.exceptions.ResourceNotFoundException;
import com.examprep.repositories.*;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.*;

/** Custom practice exams PQ-01..04, and the exam builder AI-01 reuses. */
@Service
@RequiredArgsConstructor
@Transactional
public class PracticeExamService {
    /** Types SA-04 grades without AI, so a practice exam has a score as soon as it is submitted. */
    public static final List<String> AUTO_GRADED = List.of("SINGLE_CHOICE", "MULTIPLE_CHOICE", "TRUE_FALSE", "FILL_BLANK", "ORDERING", "MATCHING");
    public static final BigDecimal MAX_SCORE = BigDecimal.TEN;

    private final PracticeExamRepository practices;
    private final ExamRepository exams;
    private final ExamQuestionRepository examQuestions;
    private final ExamAttemptRepository attempts;
    private final AttemptAnswerRepository answers;
    private final ModuleRepository modules;
    private final CourseRepository courses;
    private final EnrollmentRepository enrollments;
    private final QuestionRepository questions;
    private final UserRepository users;
    private final ObjectMapper json;

    // ------------------------------------------------------------------ PQ-01

    public PracticeDtos.Created create(Long userId, PracticeDtos.Create request) {
        Long courseId = request.courseId();
        requireEnrolled(userId, courseId);
        Set<Long> moduleIds = request.categoryIds() == null ? Set.of() : new LinkedHashSet<>(request.categoryIds());
        for (Long moduleId : moduleIds) {
            Module module = modules.findById(moduleId).orElse(null);
            if (module == null || !module.getCourse().getCourseId().equals(courseId) || module.isHidden()) {
                throw new BadRequestException("categoryIds must be visible modules of this course: " + moduleId);
            }
        }
        List<QuestionCandidate> pool = candidates(courseId, moduleIds, request.difficulty());
        int count = request.questionCount();
        if (pool.size() < count) throw notEnough(pool.size());
        List<QuestionCandidate> drawn = new ArrayList<>(pool);
        Collections.shuffle(drawn);
        drawn = drawn.subList(0, count);

        String title = "Đề luyện tùy chọn - " + ("FINAL".equals(request.examType()) ? "Cuối kỳ" : "Giữa kỳ");
        PracticeExam practice = practices.save(PracticeExam.builder().userId(userId).courseId(courseId).title(title)
                .questionCount(count).durationMinutes(request.durationMinutes()).difficulty(request.difficulty())
                .categoryIds(moduleIds.isEmpty() ? null : write(moduleIds)).build());
        Exam exam = createGeneratedExam(userId, courseId, title, "PRACTICE", request.durationMinutes(),
                drawn.stream().map(QuestionCandidate::questionId).toList());
        exam.setPracticeExamId(practice.getPracticeExamId());
        practice.setExamId(exam.getExamId());
        return new PracticeDtos.Created(practice.getPracticeExamId(), title, count, request.durationMinutes(), exam.getExamId());
    }

    /** Eligible questions of a course; empty moduleIds means every module. */
    @Transactional(readOnly = true)
    public List<QuestionCandidate> candidates(Long courseId, Collection<Long> moduleIds, String difficulty) {
        return practices.findCandidates(courseId, AUTO_GRADED, moduleIds.isEmpty(), moduleIds.isEmpty() ? List.of(-1L) : moduleIds, difficulty);
    }

    /** A student's own published exam (PRACTICE or SMART_PRACTICE), one point-equal link per question, max score 10. */
    public Exam createGeneratedExam(Long userId, Long courseId, String title, String mode, int durationMinutes, List<Long> questionIds) {
        Exam exam = exams.save(Exam.builder().course(courses.getReferenceById(courseId)).createdBy(users.getReferenceById(userId))
                .title(title).durationMinutes(durationMinutes).isPractice(true).generationType("MANUAL").maxScore(MAX_SCORE)
                .status("PUBLISHED").publishedAt(Instant.now()).mode(mode).build());
        List<ExamQuestion> links = new ArrayList<>();
        int order = 1;
        for (Long id : questionIds) {
            links.add(ExamQuestion.builder().exam(exam).question(questions.getReferenceById(id)).orderIndex(order++).weight(BigDecimal.ONE).build());
        }
        examQuestions.saveAll(links);
        return exam;
    }

    // ------------------------------------------------------------------ PQ-02 / PQ-03

    @Transactional(readOnly = true)
    public PageResponse<PracticeDtos.Item> list(Long userId, int page, int size) {
        if (page < 0 || size < 1 || size > 100) throw new BadRequestException("page must be >= 0 and size 1-100.");
        return PageResponse.of(practices.findMine(userId, PageRequest.of(page, size)));
    }

    /** Removes the practice entry; the exam is archived so existing attempts keep their paper. */
    public void delete(Long userId, Long practiceId) {
        PracticeExam practice = practices.findById(practiceId).orElseThrow(() -> new ResourceNotFoundException("Practice exam not found."));
        if (!practice.getUserId().equals(userId)) throw new ForbiddenException("This practice exam belongs to another student.");
        if (practice.getExamId() != null) exams.findById(practice.getExamId()).ifPresent(exam -> {
            exam.setStatus("ARCHIVED");
            exam.setPracticeExamId(null);
        });
        practices.delete(practice);
    }

    // ------------------------------------------------------------------ PQ-04

    /** Wrong answers of a finished attempt as the student saw them (display snapshot only: no key, no answer). */
    @Transactional(readOnly = true)
    public List<JsonNode> wrongQuestions(Long userId, Long attemptId) {
        ExamAttempt attempt = attempts.findById(attemptId).orElseThrow(() -> new ResourceNotFoundException("Attempt not found."));
        if (!attempt.getUser().getUserId().equals(userId)) throw new ForbiddenException("This attempt belongs to another student.");
        if (!Set.of("SUBMITTED", "COMPLETED").contains(attempt.getStatus())) {
            throw new BaseException(ResponseCode.ATTEMPT_NOT_SUBMITTED, "Submit the attempt first.", Map.of("code", "ATTEMPT_NOT_SUBMITTED"));
        }
        List<JsonNode> items = new ArrayList<>();
        for (AttemptAnswer answer : answers.findByAttemptIdOrdered(attemptId)) {
            if (!wrong(answer)) continue;
            ObjectNode item = display(answer.getDisplaySnapshot());
            item.put("questionId", answer.getQuestion().getQuestionId());
            items.add(item);
        }
        return items;
    }

    private static boolean wrong(AttemptAnswer answer) {
        if (answer.getIsCorrect() != null) return !answer.getIsCorrect();
        return answer.getScoreEarned() != null && answer.getWeightSnapshot() != null
                && answer.getScoreEarned().compareTo(answer.getWeightSnapshot()) < 0;
    }

    // ------------------------------------------------------------------ helpers

    void requireEnrolled(Long userId, Long courseId) {
        if (!courses.existsById(courseId)) throw new ResourceNotFoundException("Course not found.");
        if (!enrollments.existsByCourse_CourseIdAndUser_UserIdAndStatus(courseId, userId, Enrollment.STATUS_ACTIVE)) {
            throw new ForbiddenException("You are not enrolled in this course.");
        }
    }

    static BaseException notEnough(int available) {
        return new BaseException(ResponseCode.UNPROCESSABLE_VALIDATION_ERROR, "The question bank does not have enough questions.",
                Map.of("code", "NOT_ENOUGH_QUESTIONS", "available", available));
    }

    private ObjectNode display(String snapshot) {
        try {
            JsonNode node = snapshot == null ? null : json.readTree(snapshot);
            return node instanceof ObjectNode object ? object : json.createObjectNode();
        } catch (JsonProcessingException ex) {
            return json.createObjectNode();
        }
    }

    private String write(Object value) {
        try {
            return json.writeValueAsString(value);
        } catch (JsonProcessingException ex) {
            throw new IllegalStateException(ex);
        }
    }
}
