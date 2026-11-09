package com.examprep.services.student;

import com.examprep.dto.attempt.AttemptResponses;
import com.examprep.dto.student.QuestionReviewItemDto;
import com.examprep.dto.student.ReviewSessionRequestDto;
import com.examprep.dto.student.ReviewSessionResponseDto;
import com.examprep.entities.*;
import com.examprep.exceptions.BadRequestException;
import com.examprep.exceptions.BaseException;
import com.examprep.exceptions.ResourceNotFoundException;
import com.examprep.repositories.*;
import com.examprep.services.StudentAttemptService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class StudentNotebookServiceTest {

    @Mock
    private StudentQuestionReviewRepository reviewRepository;
    @Mock
    private CourseRepository courseRepository;
    private ObjectMapper objectMapper = new ObjectMapper();
    @Mock
    private QuestionRepository questionRepository;
    @Mock
    private UserRepository userRepository;
    @Mock
    private AnswerOptionRepository answerOptionRepository;
    @Mock
    private ExamRepository examRepository;
    @Mock
    private ExamQuestionRepository examQuestionRepository;
    @Mock
    private StudentAttemptService studentAttemptService;
    @Mock
    private com.examprep.repositories.ExamAttemptRepository examAttemptRepository;

    @InjectMocks
    private StudentNotebookServiceImpl notebookService;

    private User student;
    private Question question1;
    private StudentQuestionReview review1;

    @BeforeEach
    void setUp() {
        student = User.builder().userId(100L).email("student@test.com").fullName("Test Student").roleName("STUDENT").build();
        question1 = Question.builder().questionId(1L).content("What is Java?").questionType("SINGLE_CHOICE").build();
        review1 = StudentQuestionReview.builder()
                .reviewId(10L)
                .student(student)
                .question(question1)
                .status("WRONG_BOOKMARKED")
                .bookmark(true)
                .wrongCount(3)
                .firstWrongAt(Instant.now())
                .lastPracticedAt(Instant.now())
                .build();
    }

    @Test
    void listSavedQuestions_successWithBatchOptions() {
        Page<StudentQuestionReview> page = new PageImpl<>(List.of(review1));
        when(reviewRepository.findSavedQuestions(eq(100L), eq("all"), isNull(), isNull(), isNull(), eq(""), any())).thenReturn(page);

        AnswerOption opt = AnswerOption.builder().optionId(11L).question(question1).optionText("A programming language").isCorrect(true).build();
        when(answerOptionRepository.findByQuestionIds(List.of(1L))).thenReturn(List.of(opt));

        Page<QuestionReviewItemDto> result = notebookService.listSavedQuestions("all", null, null, null, null, 0, 20, 100L);

        assertNotNull(result);
        assertEquals(1, result.getTotalElements());
        QuestionReviewItemDto dto = result.getContent().get(0);
        assertEquals(1L, dto.getQuestionId());
        assertTrue(dto.isWrong());
        assertTrue(dto.isBookmarked());
        assertEquals(1, dto.getOptions().size());
        assertEquals(1, dto.getCorrectOptionIds().size());
        assertEquals(11L, dto.getCorrectOptionIds().get(0));

        verify(answerOptionRepository, times(1)).findByQuestionIds(List.of(1L));
    }

    @Test
    void getWeakSpots_successWithBatchOptions() {
        when(reviewRepository.findWeakSpots(eq(100L), isNull(), any())).thenReturn(List.of(review1));
        AnswerOption opt = AnswerOption.builder().optionId(11L).question(question1).optionText("A programming language").isCorrect(true).build();
        when(answerOptionRepository.findByQuestionIds(List.of(1L))).thenReturn(List.of(opt));

        List<QuestionReviewItemDto> list = notebookService.getWeakSpots(5, null, 100L);

        assertNotNull(list);
        assertEquals(1, list.size());
        assertEquals(1L, list.get(0).getQuestionId());
        verify(answerOptionRepository, times(1)).findByQuestionIds(List.of(1L));
    }

    @Test
    void toggleBookmark_existing() {
        when(questionRepository.findById(1L)).thenReturn(Optional.of(question1));
        when(reviewRepository.findByStudent_UserIdAndQuestion_QuestionId(100L, 1L)).thenReturn(Optional.of(review1));

        Map<String, Object> res = notebookService.toggleBookmark(1L, 100L);

        assertNotNull(res);
        assertEquals(1L, res.get("questionId"));
        assertEquals(false, res.get("isBookmarked"));
        assertFalse(review1.getBookmark());
        verify(reviewRepository).save(review1);
    }

    @Test
    void deleteSavedQuestion_notOwner_throws() {
        User otherUser = User.builder().userId(999L).build();
        review1.setStudent(otherUser);
        when(reviewRepository.findById(10L)).thenReturn(Optional.of(review1));

        assertThrows(ResourceNotFoundException.class, () -> notebookService.deleteSavedQuestion(10L, 100L));
    }

    @Test
    void startReviewSession_invalidExamType_throws() {
        ReviewSessionRequestDto req = new ReviewSessionRequestDto();
        req.setSize(1);
        req.setType("wrong");
        req.setExamType("INVALID");

        assertThrows(BadRequestException.class, () -> notebookService.startReviewSession(req, 100L));
    }

    @Test
    void startReviewSession_noCandidates_throws() {
        ReviewSessionRequestDto req = new ReviewSessionRequestDto();
        req.setSize(10);
        req.setType("wrong");
        req.setExamType("QUIZ");
        req.setCourseId(1L);

        when(courseRepository.existsById(1L)).thenReturn(true);
        when(reviewRepository.findReviewCandidatesForCourseAndExamType(eq(100L), eq("wrong"), eq("QUIZ"), eq(1L), any())).thenReturn(List.of());

        assertThrows(BaseException.class, () -> notebookService.startReviewSession(req, 100L));
    }

    @Test
    void startReviewSession_success() {
        ReviewSessionRequestDto req = new ReviewSessionRequestDto();
        req.setSize(1);
        req.setType("wrong");
        req.setExamType("QUIZ");
        req.setCourseId(1L);

        when(courseRepository.existsById(1L)).thenReturn(true);
        when(reviewRepository.findReviewCandidatesForCourseAndExamType(eq(100L), eq("wrong"), eq("QUIZ"), eq(1L), any())).thenReturn(List.of(review1));
        when(userRepository.findById(100L)).thenReturn(Optional.of(student));
        Exam mockExam = Exam.builder().examId(500L).title("Review Practice").maxScore(BigDecimal.ONE).durationMinutes(null).build();
        when(examRepository.save(any(Exam.class))).thenReturn(mockExam);

        AttemptResponses.Session mockSession = new AttemptResponses.Session(
                456L, 500L, "Review Practice", "IN_PROGRESS", Instant.now(), null,
                Instant.now(), BigDecimal.ONE, List.of(new AttemptResponses.Question(1L, 1, "SINGLE_CHOICE", "What is Java?", List.of(), null, BigDecimal.ONE, null, null)),
                null, Exam.MODE_PRACTICE_EXAM, null, null
        );
        when(studentAttemptService.start(eq(100L), eq(500L), isNull())).thenReturn(mockSession);

        com.examprep.entities.ExamAttempt attempt = com.examprep.entities.ExamAttempt.builder().mode(Exam.MODE_PRACTICE_EXAM).build();
        when(examAttemptRepository.findById(any())).thenReturn(Optional.of(attempt));
        ReviewSessionResponseDto res = notebookService.startReviewSession(req, 100L);
        assertEquals(Exam.MODE_PRACTICE_EXAM, attempt.getMode());

        assertNotNull(res);
        assertEquals(500L, res.getExamId());
        assertEquals(456L, res.getAttemptId());
        assertEquals(1, res.getQuestions().size());
        assertEquals(1L, res.getQuestions().get(0).getQuestionId());
        verify(examRepository).save(any(Exam.class));
        verify(studentAttemptService).start(eq(100L), eq(500L), isNull());
    }

    @Test
    void listSavedQuestions_invalidExamType_throws() {
        assertThrows(BadRequestException.class, () -> notebookService.listSavedQuestions("all", "INVALID", null, null, null, 0, 20, 100L));
    }

    @Test
    void deleteAllBookmarks_callsRepo() {
        notebookService.deleteAllBookmarks(100L);
        verify(reviewRepository).unbookmarkAllByStudentUserId(100L);
    }

    @Test
    void bookmarkAll_callsRepo() {
        notebookService.bookmarkAll(100L);
        verify(reviewRepository).bookmarkAllByStudentUserId(100L);
    }

    @Test
    void deleteAllSavedQuestions_callsRepo() {
        notebookService.deleteAllSavedQuestions(100L);
        verify(reviewRepository).deleteAllByStudentUserId(100L);
    }
}
