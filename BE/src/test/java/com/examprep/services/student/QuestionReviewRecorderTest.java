package com.examprep.services.student;

import com.examprep.entities.AnswerOption;
import com.examprep.entities.Question;
import com.examprep.entities.StudentQuestionReview;
import com.examprep.entities.User;
import com.examprep.repositories.AnswerOptionRepository;
import com.examprep.repositories.StudentQuestionReviewRepository;
import com.examprep.repositories.UserRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class QuestionReviewRecorderTest {
    private final StudentQuestionReviewRepository reviews = mock(StudentQuestionReviewRepository.class);
    private final UserRepository users = mock(UserRepository.class);
    private final AnswerOptionRepository options = mock(AnswerOptionRepository.class);
    private final QuestionReviewRecorder recorder = new QuestionReviewRecorder(reviews, users, options, new ObjectMapper());
    private final Question choice = Question.builder().questionId(1L).questionType("MULTIPLE_CHOICE").content("q").build();

    private StudentQuestionReview row(String status, int wrong, int streak) {
        return StudentQuestionReview.builder().reviewId(9L).question(choice).status(status).bookmark(false).wrongCount(wrong)
                .correctStreak(streak).firstWrongAt(Instant.EPOCH).lastPracticedAt(Instant.EPOCH).build();
    }

    @Test void wrongAnswerOpensARowWithTheReadableChoice() {
        when(reviews.findByStudent_UserIdAndQuestion_QuestionId(5L, 1L)).thenReturn(Optional.empty());
        when(users.getReferenceById(5L)).thenReturn(User.builder().userId(5L).build());
        when(options.findByQuestionIds(List.of(1L))).thenReturn(List.of(
                AnswerOption.builder().optionId(14L).optionText("Override").build(),
                AnswerOption.builder().optionId(15L).optionText("Overload").build()));
        recorder.record(5L, choice, false, "{\"selectedOptionIds\":[15,14]}");
        verify(reviews).save(argThat(r -> "WRONG_BOOKMARKED".equals(r.getStatus()) && r.getWrongCount() == 1
                && "Overload, Override".equals(r.getLastWrongChoice()) && r.getCorrectStreak() == 0));
    }

    @Test void twoRightAnswersInARowResolveAWrongRowAndAWrongOneResetsTheStreak() {
        StudentQuestionReview r = row("WRONG_BOOKMARKED", 3, 0);
        when(reviews.findByStudent_UserIdAndQuestion_QuestionId(5L, 1L)).thenReturn(Optional.of(r));
        recorder.record(5L, choice, true, null);
        assertEquals("WRONG_BOOKMARKED", r.getStatus());
        assertEquals(1, r.getCorrectStreak());
        assertTrue(r.getLastPracticedAt().isAfter(Instant.EPOCH), "practising right counts as practice");
        recorder.record(5L, choice, false, "{\"selectedOptionIds\":[]}");
        assertEquals(0, r.getCorrectStreak());
        assertEquals(4, r.getWrongCount());
        assertEquals("(bỏ trống)", r.getLastWrongChoice());
        recorder.record(5L, choice, true, null);
        recorder.record(5L, choice, true, null);
        assertEquals("ANSWERED_BOOKMARKED", r.getStatus());
    }

    @Test void rightAnswerWithoutARowWritesNothing() {
        when(reviews.findByStudent_UserIdAndQuestion_QuestionId(5L, 1L)).thenReturn(Optional.empty());
        recorder.record(5L, choice, true, null);
        verify(reviews, never()).save(any());
    }

    @Test void describesEveryAnswerShape() {
        Question blank = Question.builder().questionId(2L).questionType("FILL_BLANK").build();
        Question match = Question.builder().questionId(3L).questionType("MATCHING").build();
        Question essay = Question.builder().questionId(4L).questionType("ESSAY").build();
        Question diagram = Question.builder().questionId(5L).questionType("DIAGRAM").build();
        assertEquals("(1) int / Integer; (2) x", recorder.describe(blank, "{\"blanks\":{\"1\":[\"int\",\"Integer\"],\"2\":\"x\"}}"));
        assertEquals("a → 1; b → 2", recorder.describe(match, "{\"matches\":[{\"left\":\"a\",\"right\":\"1\"},{\"left\":\"b\",\"right\":\"2\"}]}"));
        assertEquals("x".repeat(500), recorder.describe(essay, "{\"text\":\"" + "x".repeat(600) + "\"}"));
        assertEquals("(bản vẽ)", recorder.describe(diagram, "{\"drawioXml\":\"<mxfile/>\"}"));
        assertEquals("legacy", recorder.describe(essay, "legacy"));
    }

    @Test void rubricPassesAtHalfThePoints() {
        assertTrue(QuestionReviewRecorder.rubricPassed(new BigDecimal("0.25"), new BigDecimal("0.50")));
        assertFalse(QuestionReviewRecorder.rubricPassed(new BigDecimal("0.24"), new BigDecimal("0.50")));
        assertFalse(QuestionReviewRecorder.rubricPassed(null, BigDecimal.ONE));
    }
}
