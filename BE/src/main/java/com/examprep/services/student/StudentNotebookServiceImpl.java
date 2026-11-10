package com.examprep.services.student;

import com.examprep.dto.ResponseCode;
import com.examprep.dto.attempt.AttemptResponses;
import com.examprep.dto.student.QuestionReviewItemDto;
import com.examprep.dto.student.ReviewSessionRequestDto;
import com.examprep.dto.student.ReviewSessionResponseDto;
import com.examprep.repositories.CourseRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.examprep.entities.AnswerOption;
import com.examprep.entities.Course;
import com.examprep.entities.Exam;
import com.examprep.entities.ExamAttempt;
import com.examprep.entities.ExamQuestion;
import com.examprep.entities.Question;
import com.examprep.entities.StudentQuestionReview;
import com.examprep.entities.User;
import com.examprep.exceptions.BadRequestException;
import com.examprep.exceptions.BaseException;
import com.examprep.exceptions.ResourceNotFoundException;
import com.examprep.repositories.AnswerOptionRepository;
import com.examprep.repositories.ExamAttemptRepository;
import com.examprep.repositories.ExamQuestionRepository;
import com.examprep.repositories.ExamRepository;
import com.examprep.repositories.QuestionRepository;
import com.examprep.repositories.StudentQuestionReviewRepository;
import com.examprep.repositories.UserRepository;
import com.examprep.services.StudentAttemptService;
import com.examprep.util.QuestionNotebookPdfWriter;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.examprep.dto.attempt.Snapshots;
import com.examprep.entities.AttemptAnswer;
import com.examprep.repositories.AttemptAnswerRepository;
import com.examprep.repositories.AttemptStartKeyRepository;
import com.examprep.services.AttemptPaperFactory;
import com.examprep.util.attempt.AttemptShuffler;
import java.time.Instant;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Objects;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Transactional
public class StudentNotebookServiceImpl implements StudentNotebookService {

    private final StudentQuestionReviewRepository reviewRepository;
    private final QuestionRepository questionRepository;
    private final UserRepository userRepository;
    private final AnswerOptionRepository answerOptionRepository;
    private final ExamAttemptRepository examAttemptRepository;
    private final AttemptAnswerRepository answerRepository;
    private final AttemptStartKeyRepository startKeyRepository;
    private final AttemptPaperFactory paperFactory;
    private final ExamRepository examRepository;
    private final ExamQuestionRepository examQuestionRepository;
    private final StudentAttemptService studentAttemptService;
    private final com.examprep.repositories.CourseRepository courseRepository;
    private final com.examprep.util.QuestionNotebookPdfWriter questionNotebookPdfWriter;
    private final com.fasterxml.jackson.databind.ObjectMapper objectMapper = new com.fasterxml.jackson.databind.ObjectMapper();

    @Override
    @Transactional(readOnly = true)
    public Page<QuestionReviewItemDto> listSavedQuestions(String type, String examType, Long courseId, Long categoryId, String search, int page, int size, Long userId) {
        if (type == null || type.isBlank()) {
            type = "all";
        }
        String normalizedExamType = null;
        if (examType != null && !examType.isBlank()) {
            String upper = examType.strip().toUpperCase(java.util.Locale.ROOT);
            if ("QUIZ".equals(upper)) {
                normalizedExamType = "QUIZ";
            } else if ("ESSAY".equals(upper)) {
                normalizedExamType = "ESSAY";
            } else if ("ALL".equals(upper)) {
                normalizedExamType = null;
            } else {
                throw new BadRequestException(ResponseCode.VALIDATION_ERROR, "Invalid examType. Must be QUIZ or ESSAY.");
            }
        }

        Pageable pageable = PageRequest.of(page, size);
        String searchTerm = (search != null && !search.isBlank()) ? search.trim() : "";
        if (searchTerm.length() > 100) {
            searchTerm = searchTerm.substring(0, 100);
        }

        Page<StudentQuestionReview> reviews = reviewRepository.findSavedQuestions(
                userId, type, normalizedExamType, courseId, categoryId, searchTerm, pageable);

        List<Long> questionIds = reviews.getContent().stream()
                .map(r -> r.getQuestion().getQuestionId())
                .distinct()
                .toList();

        Map<Long, List<AnswerOption>> optionsByQuestionId = questionIds.isEmpty() ? Collections.emptyMap() :
                answerOptionRepository.findByQuestionIds(questionIds).stream()
                        .collect(Collectors.groupingBy(o -> o.getQuestion().getQuestionId()));

        return reviews.map(r -> {
            Question q = r.getQuestion();
            List<AnswerOption> options = optionsByQuestionId.getOrDefault(q.getQuestionId(), Collections.emptyList());
            List<QuestionReviewItemDto.OptionDto> optionDtos = options.stream()
                    .map(o -> new QuestionReviewItemDto.OptionDto(o.getOptionId(), o.getOptionText()))
                    .toList();

            List<Long> correctOptionIds = options.stream()
                    .filter(o -> Boolean.TRUE.equals(o.getIsCorrect()))
                    .map(AnswerOption::getOptionId)
                    .toList();

            boolean isWrong = "WRONG_BOOKMARKED".equals(r.getStatus());
            boolean isBookmarked = Boolean.TRUE.equals(r.getBookmark());

            return new QuestionReviewItemDto(
                    r.getReviewId(),
                    q.getQuestionId(),
                    isWrong,
                    isBookmarked,
                    q.getContent(),
                    q.getQuestionType(),
                    optionDtos,
                    correctOptionIds,
                    r.getLastWrongChoice(),
                    r.getWrongCount(),
                    r.getFirstWrongAt(),
                    r.getLastPracticedAt()
            );
        });
    }

    @Override
    public Map<String, Object> toggleBookmark(Long questionId, Long userId) {
        Question question = questionRepository.findById(questionId)
                .orElseThrow(() -> new ResourceNotFoundException("Question not found"));

        Optional<StudentQuestionReview> existing = reviewRepository.findByStudent_UserIdAndQuestion_QuestionId(userId, questionId);
        boolean newBookmarkState;
        if (existing.isPresent()) {
            StudentQuestionReview r = existing.get();
            newBookmarkState = !Boolean.TRUE.equals(r.getBookmark());
            r.setBookmark(newBookmarkState);
            reviewRepository.save(r);
        } else {
            User student = userRepository.findById(userId)
                    .orElseThrow(() -> new ResourceNotFoundException("User not found"));
            newBookmarkState = true;
            StudentQuestionReview r = StudentQuestionReview.builder()
                    .student(student)
                    .question(question)
                    .status("ANSWERED_BOOKMARKED")
                    .bookmark(true)
                    .wrongCount(0)
                    .firstWrongAt(Instant.now())
                    .lastPracticedAt(Instant.now())
                    .build();
            reviewRepository.save(r);
        }

        return Map.of("questionId", questionId, "isBookmarked", newBookmarkState);
    }

    @Override
    public void deleteSavedQuestion(Long reviewId, Long userId) {
        StudentQuestionReview r = reviewRepository.findById(reviewId)
                .orElseThrow(() -> new ResourceNotFoundException("Review item not found"));
        if (!r.getStudent().getUserId().equals(userId)) {
            throw new ResourceNotFoundException("Review item not found");
        }
        reviewRepository.delete(r);
    }

    @Override
    public ReviewSessionResponseDto startReviewSession(ReviewSessionRequestDto request, Long userId) {
        int size = request.getSize() != null ? request.getSize() : 10;
        if (size < 1 || size > 50) {
            throw new BadRequestException("Size must be between 1 and 50");
        }
        String type = request.getType() != null ? request.getType() : "wrong";
        String examType = request.getExamType() != null ? request.getExamType().toUpperCase() : "QUIZ";
        if (!"QUIZ".equals(examType) && !"ESSAY".equals(examType)) {
            throw new BadRequestException(ResponseCode.VALIDATION_ERROR, "examType must be QUIZ or ESSAY");
        }
        Long courseId = request.getCourseId();
        if (courseId != null && !courseRepository.existsById(courseId)) {
            throw new ResourceNotFoundException("Course not found");
        }

        List<StudentQuestionReview> candidates = reviewRepository.findReviewCandidatesForCourseAndExamType(
                userId, type, examType, courseId, PageRequest.of(0, 100));
        if (candidates.size() < size) {
            throw new BaseException(ResponseCode.VALIDATION_ERROR,
                    "Not enough questions available for review. Available: " + candidates.size() + ", required: " + size);
        }

        User student = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User not found"));

        List<StudentQuestionReview> shuffled = new ArrayList<>(candidates);
        Collections.shuffle(shuffled);
        List<StudentQuestionReview> selected = shuffled.stream().limit(size).toList();

        List<Question> questions = selected.stream().map(StudentQuestionReview::getQuestion).toList();
        Course course = courseId != null ? courseRepository.getReferenceById(courseId) : questions.get(0).getCourse();
        if (course == null && questions.get(0).getModule() != null) {
            course = questions.get(0).getModule().getCourse();
        }

        String title = switch (type) {
            case "bookmarked" -> "Ôn câu đã lưu";
            case "all" -> "Ôn tập sổ lỗi";
            default -> "Ôn câu sai";
        } + " - " + ("ESSAY".equals(examType) ? "Tự luận" : "Trắc nghiệm");

        String practiceConfig = writePracticeConfig(examType, size, null, List.of());

        Exam exam = examRepository.save(Exam.builder()
                .course(course)
                .createdBy(student)
                .title(title)
                .description("Review practice exam for student mistake notebook")
                .generationType("MANUAL")
                .durationMinutes(request.getDurationMinutes())
                .maxScore(BigDecimal.valueOf(size))
                .status("PUBLISHED")
                .publishedAt(Instant.now())
                .mode(Exam.MODE_PRACTICE_EXAM)
                .practiceConfig(practiceConfig)
                .build());

        List<ExamQuestion> examQuestions = new ArrayList<>();
        int order = 1;
        for (Question q : questions) {
            examQuestions.add(ExamQuestion.builder()
                    .exam(exam)
                    .question(q)
                    .orderIndex(order++)
                    .weight(BigDecimal.ONE)
                    .build());
        }
        examQuestionRepository.saveAll(examQuestions);
        examQuestionRepository.flush();

        AttemptResponses.Session session = studentAttemptService.start(userId, exam.getExamId(), null);
        examAttemptRepository.findById(session.attemptId()).ifPresent(attempt -> attempt.setMode(Exam.MODE_PRACTICE_EXAM));

        List<ReviewSessionResponseDto.ReviewQuestionDto> questionDtos = session.questions().stream()
                .map(q -> new ReviewSessionResponseDto.ReviewQuestionDto(
                        q.questionId(),
                        q.orderIndex(),
                        q.questionType(),
                        q.content(),
                        q.options() == null ? null : q.options().stream()
                                .map(o -> new ReviewSessionResponseDto.OptionDto(o.optionId(), o.optionText()))
                                .toList(),
                        q.maxPoints()
                ))
                .toList();

        return new ReviewSessionResponseDto(
                exam.getExamId(),
                session.attemptId(),
                examType,
                title,
                session.maxScore(),
                exam.getDurationMinutes(),
                questionDtos
        );
    }

    private String writePracticeConfig(String examType, int questionCount, String difficulty, List<Long> moduleIds) {
        try {
            Map<String, Object> config = new java.util.LinkedHashMap<>();
            config.put("examType", examType);
            config.put("questionCount", questionCount);
            config.put("difficulty", difficulty);
            config.put("moduleIds", moduleIds);
            return objectMapper.writeValueAsString(config);
        } catch (JsonProcessingException ex) {
            throw new IllegalStateException(ex);
        }
    }

    @Override
    @Transactional(readOnly = true)
    public List<QuestionReviewItemDto> getWeakSpots(int limit, Long courseId, Long userId) {
        if (limit < 1 || limit > 20) {
            limit = 5;
        }
        List<StudentQuestionReview> weakSpots = reviewRepository.findWeakSpots(userId, courseId, PageRequest.of(0, limit));

        List<Long> questionIds = weakSpots.stream()
                .map(r -> r.getQuestion().getQuestionId())
                .distinct()
                .toList();

        Map<Long, List<AnswerOption>> optionsByQuestionId = questionIds.isEmpty() ? Collections.emptyMap() :
                answerOptionRepository.findByQuestionIds(questionIds).stream()
                        .collect(Collectors.groupingBy(o -> o.getQuestion().getQuestionId()));

        return weakSpots.stream().map(r -> {
            Question q = r.getQuestion();
            List<AnswerOption> options = optionsByQuestionId.getOrDefault(q.getQuestionId(), Collections.emptyList());
            List<QuestionReviewItemDto.OptionDto> optionDtos = options.stream()
                    .map(o -> new QuestionReviewItemDto.OptionDto(o.getOptionId(), o.getOptionText()))
                    .toList();

            List<Long> correctOptionIds = options.stream()
                    .filter(o -> Boolean.TRUE.equals(o.getIsCorrect()))
                    .map(AnswerOption::getOptionId)
                    .toList();

            boolean isWrong = "WRONG_BOOKMARKED".equals(r.getStatus());
            boolean isBookmarked = Boolean.TRUE.equals(r.getBookmark());

            return new QuestionReviewItemDto(
                    r.getReviewId(),
                    q.getQuestionId(),
                    isWrong,
                    isBookmarked,
                    q.getContent(),
                    q.getQuestionType(),
                    optionDtos,
                    correctOptionIds,
                    r.getLastWrongChoice(),
                    r.getWrongCount(),
                    r.getFirstWrongAt(),
                    r.getLastPracticedAt()
            );
        }).toList();
    }

    @Override
    @Transactional
    public void deleteAllBookmarks(Long userId) {
        reviewRepository.unbookmarkAllByStudentUserId(userId);
    }

    @Override
    @Transactional
    public void bookmarkAll(Long userId) {
        reviewRepository.bookmarkAllByStudentUserId(userId);
    }

    @Override
    @Transactional
    public void deleteAllSavedQuestions(Long userId) {
        reviewRepository.deleteAllByStudentUserId(userId);
    }

    @Override
    @Transactional(readOnly = true)
    public QuestionNotebookPdfWriter.RenderedPdf exportSavedQuestionsPdf(Long userId, Long courseId, String type, String examType) {
        Page<QuestionReviewItemDto> page = listSavedQuestions(type, examType, courseId, null, null, 0, 1000, userId);
        return questionNotebookPdfWriter.write(page.getContent());
    }
}
