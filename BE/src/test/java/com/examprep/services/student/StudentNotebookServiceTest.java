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
        when(reviewRepository.findSavedQuestions(eq(100L), eq("all"), eq(""), any())).thenReturn(page);

        AnswerOption opt = AnswerOption.builder().optionId(11L).question(question1).optionText("A programming language").isCorrect(true).build();
        when(answerOptionRepository.findByQuestionIds(List.of(1L))).thenReturn(List.of(opt));

        Page<QuestionReviewItemDto> result = notebookService.listSavedQuestions("all", null, null, null, 0, 20, 100L);

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
        when(reviewRepository.findWeakSpots(eq(100L), any())).thenReturn(List.of(review1));
        AnswerOption opt = AnswerOption.builder().optionId(11L).question(question1).optionText("A programming language").isCorrect(true).build();
        when(answerOptionRepository.findByQuestionIds(List.of(1L))).thenReturn(List.of(opt));

        List<QuestionReviewItemDto> list = notebookService.getWeakSpots(5, 100L);

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

        when(reviewRepository.findReviewCandidatesForExamType(eq(100L), eq("wrong"), eq("QUIZ"), any())).thenReturn(List.of());

        assertThrows(BaseException.class, () -> notebookService.startReviewSession(req, 100L));
    }

    @Test
    void startReviewSession_success() {
        ReviewSessionRequestDto req = new ReviewSessionRequestDto();
        req.setSize(1);
        req.setType("wrong");
        req.setExamType("QUIZ");

        when(reviewRepository.findReviewCandidatesForExamType(eq(100L), eq("wrong"), eq("QUIZ"), any())).thenReturn(List.of(review1));
        when(userRepository.findById(100L)).thenReturn(Optional.of(student));
        Exam mockExam = Exam.builder().examId(500L).title("Review Practice").maxScore(BigDecimal.ONE).durationMinutes(120).build();
        when(examRepository.save(any(Exam.class))).thenReturn(mockExam);

        AttemptResponses.Session mockSession = new AttemptResponses.Session(
                456L, 500L, "Review Practice", "IN_PROGRESS", Instant.now(), Instant.now().plusSeconds(7200),
                Instant.now(), BigDecimal.ONE, List.of(new AttemptResponses.Question(1L, 1, "SINGLE_CHOICE", "What is Java?", List.of(), null, BigDecimal.ONE, null, null)),
                null, "REVIEW", null
        );
        when(studentAttemptService.start(eq(100L), eq(500L), isNull())).thenReturn(mockSession);

        ReviewSessionResponseDto res = notebookService.startReviewSession(req, 100L);

        assertNotNull(res);
        assertEquals(500L, res.getExamId());
        assertEquals(456L, res.getAttemptId());
        assertEquals(1, res.getQuestions().size());
        assertEquals(1L, res.getQuestions().get(0).getQuestionId());
        verify(examRepository).save(any(Exam.class));
        verify(studentAttemptService).start(eq(100L), eq(500L), isNull());
    }

    @Test
    void recordWrongAnswer_new() {
        when(reviewRepository.findByStudent_UserIdAndQuestion_QuestionId(100L, 1L)).thenReturn(Optional.empty());
        when(userRepository.getReferenceById(100L)).thenReturn(student);

        notebookService.recordWrongAnswer(100L, question1, "wrong answer");

        verify(reviewRepository).save(any(StudentQuestionReview.class));
    }

    @Test
    void recordWrongAnswer_existing() {
        when(reviewRepository.findByStudent_UserIdAndQuestion_QuestionId(100L, 1L)).thenReturn(Optional.of(review1));

        notebookService.recordWrongAnswer(100L, question1, "wrong answer 2");

        assertEquals(4, review1.getWrongCount());
        assertEquals("wrong answer 2", review1.getLastWrongChoice());
        verify(reviewRepository).save(review1);
    }
}
