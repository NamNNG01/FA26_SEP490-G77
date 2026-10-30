package com.examprep.services.student;

import com.examprep.dto.ResponseCode;
import com.examprep.dto.student.QuestionReviewItemDto;
import com.examprep.dto.student.ReviewSessionRequestDto;
import com.examprep.dto.student.ReviewSessionResponseDto;
import com.examprep.entities.AnswerOption;
import com.examprep.entities.ExamAttempt;
import com.examprep.entities.Question;
import com.examprep.entities.StudentQuestionReview;
import com.examprep.entities.User;
import com.examprep.exceptions.BadRequestException;
import com.examprep.exceptions.BaseException;
import com.examprep.exceptions.ResourceNotFoundException;
import com.examprep.repositories.AnswerOptionRepository;
import com.examprep.repositories.ExamAttemptRepository;
import com.examprep.repositories.QuestionRepository;
import com.examprep.repositories.StudentQuestionReviewRepository;
import com.examprep.repositories.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Service
@RequiredArgsConstructor
@Transactional
public class StudentNotebookServiceImpl implements StudentNotebookService {

    private final StudentQuestionReviewRepository reviewRepository;
    private final QuestionRepository questionRepository;
    private final UserRepository userRepository;
    private final AnswerOptionRepository answerOptionRepository;
    private final ExamAttemptRepository examAttemptRepository;

    @Override
    @Transactional(readOnly = true)
    public Page<QuestionReviewItemDto> listSavedQuestions(String type, String examType, Long categoryId, String search, int page, int size, Long userId) {
        if (type == null || type.isBlank()) {
            type = "all";
        }
        Pageable pageable = PageRequest.of(page, size);
        String searchTerm = (search != null && !search.isBlank()) ? search.trim() : "";
        if (searchTerm.length() > 100) {
            searchTerm = searchTerm.substring(0, 100);
        }

        Page<StudentQuestionReview> reviews = reviewRepository.findSavedQuestions(userId, type, searchTerm, pageable);

        return reviews.map(r -> {
            Question q = r.getQuestion();
            List<AnswerOption> options = answerOptionRepository.findByQuestionIds(List.of(q.getQuestionId()));
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

        List<StudentQuestionReview> candidates = reviewRepository.findReviewCandidates(userId, type, PageRequest.of(0, size));
        if (candidates.isEmpty()) {
            throw new BaseException(ResponseCode.VALIDATION_ERROR, "No questions match the filter");
        }

        User student = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User not found"));

        ExamAttempt attempt = ExamAttempt.builder()
                .user(student)
                .exam(null)
                .mode("REVIEW")
                .status("IN_PROGRESS")
                .startTime(Instant.now())
                .deadlineAt(Instant.now().plusSeconds(7200))
                .autoSubmitted(false)
                .build();
        examAttemptRepository.save(attempt);

        List<ReviewSessionResponseDto.ReviewQuestionDto> questionDtos = new java.util.ArrayList<>();
        int index = 1;
        for (StudentQuestionReview r : candidates) {
            Question q = r.getQuestion();
            List<AnswerOption> options = answerOptionRepository.findByQuestionIds(List.of(q.getQuestionId()));
            List<ReviewSessionResponseDto.OptionDto> optDtos = options.stream()
                    .map(o -> new ReviewSessionResponseDto.OptionDto(o.getOptionId(), o.getOptionText()))
                    .toList();
            questionDtos.add(new ReviewSessionResponseDto.ReviewQuestionDto(
                    q.getQuestionId(),
                    index++,
                    q.getQuestionType(),
                    q.getContent(),
                    optDtos
            ));
        }

        return new ReviewSessionResponseDto(attempt.getAttemptId(), questionDtos);
    }

    @Override
    @Transactional(readOnly = true)
    public List<QuestionReviewItemDto> getWeakSpots(int limit, Long userId) {
        if (limit < 1 || limit > 20) {
            limit = 5;
        }
        List<StudentQuestionReview> weakSpots = reviewRepository.findWeakSpots(userId, PageRequest.of(0, limit));
        return weakSpots.stream().map(r -> {
            Question q = r.getQuestion();
            List<AnswerOption> options = answerOptionRepository.findByQuestionIds(List.of(q.getQuestionId()));
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
}
