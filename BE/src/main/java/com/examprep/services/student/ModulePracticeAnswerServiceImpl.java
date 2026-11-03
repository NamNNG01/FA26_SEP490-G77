package com.examprep.services.student;

import com.examprep.dto.ResponseCode;
import com.examprep.dto.attempt.Snapshots;
import com.examprep.dto.practice.ModulePracticeRequests;
import com.examprep.dto.practice.ModulePracticeResponses;
import com.examprep.entities.QuestionPracticeAnswer;
import com.examprep.entities.QuestionPracticeSession;
import com.examprep.entities.QuestionPracticeSessionQuestion;
import com.examprep.exceptions.BaseException;
import com.examprep.exceptions.ResourceConflictException;
import com.examprep.exceptions.ResourceNotFoundException;
import com.examprep.repositories.QuestionPracticeAnswerRepository;
import com.examprep.repositories.QuestionPracticeSessionQuestionRepository;
import com.examprep.repositories.QuestionPracticeSessionRepository;
import com.examprep.services.ModulePracticeGradingWorker;
import com.examprep.util.attempt.AnswerResponseValidator;
import com.examprep.util.attempt.AttemptGrader;
import com.examprep.util.attempt.AttemptScoring;
import com.fasterxml.jackson.databind.JsonNode;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

/**
 * MP-05 / MP-06.
 *
 * <p>A submission is validated against the session's frozen {@code display_snapshot} with the same
 * {@link AnswerResponseValidator} an exam uses, graded against the frozen {@code key_snapshot} with
 * the same {@link AttemptGrader}, and stored as a new row. Nothing is ever computed from a value the
 * client sent beyond its own answer.</p>
 */
@Service
@RequiredArgsConstructor
public class ModulePracticeAnswerServiceImpl implements ModulePracticeAnswerService {

    /** Objective grading state, identical to {@code attempt_answers.grading_status}. */
    private static final String AUTO = "AUTO";
    /** Rubric grades are produced by the AI worker; the answer waits in this state. */
    private static final String QUEUED = "QUEUED";

    /** One practice question is worth one point; an objective answer either earns it or not. */
    public static final BigDecimal QUESTION_MAX_POINTS = BigDecimal.ONE.setScale(2);

    private final ModulePracticeSupport support;
    private final QuestionPracticeSessionRepository sessions;
    private final QuestionPracticeSessionQuestionRepository sessionQuestions;
    private final QuestionPracticeAnswerRepository answers;
    private final ModulePracticeGradingWorker gradingWorker;

    // ------------------------------------------------------------------ MP-05

    @Override
    @Transactional
    public ModulePracticeResponses.AnswerSubmitted submit(Long userId, Long sessionId, Long sessionQuestionId,
                                                          ModulePracticeRequests.SubmitAnswer request) {
        QuestionPracticeSession session = sessions.lockOwned(sessionId, userId)
                .orElseThrow(() -> new ResourceNotFoundException(ResponseCode.PRACTICE_SESSION_NOT_FOUND,
                        "Practice session not found"));
        // A session of a hidden module or of a course the student has left stops accepting answers.
        support.requireModuleAccess(userId, session);
        if (!session.isInProgress()) {
            throw new ResourceConflictException("Practice session is already completed");
        }
        QuestionPracticeSessionQuestion sessionQuestion = sessionQuestions.lockInSession(sessionId, sessionQuestionId)
                .orElseThrow(() -> new ResourceNotFoundException(
                        "Question is not part of this practice session"));

        JsonNode response = request == null ? null : request.response();
        if (AnswerResponseValidator.isEmpty(response)) {
            throw new BaseException(ResponseCode.VALIDATION_ERROR, "A practice answer must not be empty");
        }
        Snapshots.DisplayQuestion display = support.displayOf(sessionQuestion);
        String questionType = display != null
                ? display.questionType()
                : sessionQuestion.getQuestion().getQuestionType();
        Optional<String> invalid = AnswerResponseValidator.validate(questionType, response, display);
        if (invalid.isPresent()) {
            throw new BaseException(ResponseCode.VALIDATION_ERROR, invalid.get());
        }

        String requestKey = request == null || request.requestKey() == null || request.requestKey().isBlank()
                ? null
                : request.requestKey().trim();
        if (requestKey != null) {
            // Replayed request: answer with the attempt that is already stored instead of adding one.
            List<QuestionPracticeAnswer> stored = answers.findByRequestKey(sessionQuestionId, requestKey);
            if (!stored.isEmpty()) {
                return submitted(session, sessionQuestion, stored.get(0), true);
            }
        }

        Instant now = Instant.now();
        int attemptNumber = answers.maxAttemptNumber(sessionQuestionId) + 1;
        boolean rubric = AttemptGrader.isRubricType(questionType);
        QuestionPracticeAnswer answer = QuestionPracticeAnswer.builder()
                .sessionQuestion(sessionQuestion)
                .attemptNumber(attemptNumber)
                .response(support.writeResponse(response))
                .gradingStatus(rubric ? QUEUED : AUTO)
                .timeSpentSeconds(request == null || request.timeSpentSeconds() == null
                        ? 0 : request.timeSpentSeconds())
                .answeredAt(now)
                .requestKey(requestKey)
                .build();
        if (!rubric) {
            Snapshots.KeySnapshot key = support.keyOf(sessionQuestion);
            AttemptGrader.Grade grade = AttemptGrader.grade(questionType, response, key, QUESTION_MAX_POINTS);
            answer.setIsCorrect(grade.correct());
            answer.setScoreEarned(AttemptScoring.output(grade.score()));
            answer.setGradedAt(now);
        }
        answers.saveAndFlush(answer);

        support.applyLatestAnswer(sessionQuestion);
        sessionQuestions.save(sessionQuestion);
        support.refreshCounters(session, now);
        sessions.save(session);
        support.refreshProgress(sessionQuestion);
        if (rubric) {
            // The AI call must never run inside this transaction.
            kickAfterCommit();
        }
        return submitted(session, sessionQuestion, answer, false);
    }

    private ModulePracticeResponses.AnswerSubmitted submitted(QuestionPracticeSession session,
                                                              QuestionPracticeSessionQuestion sessionQuestion,
                                                              QuestionPracticeAnswer answer,
                                                              boolean duplicate) {
        return new ModulePracticeResponses.AnswerSubmitted(
                session.getSessionId(),
                sessionQuestion.getSessionQuestionId(),
                sessionQuestion.getQuestion().getQuestionId(),
                answer.getPracticeAnswerId(),
                answer.getAttemptNumber(),
                answer.getIsCorrect(),
                answer.getScoreEarned(),
                answer.getGradingStatus(),
                support.readJson(answer.getFeedback()),
                support.readJson(answer.getCriteriaScores()),
                answer.getAnsweredAt(),
                answer.getGradedAt(),
                duplicate,
                support.progressOf(session));
    }

    private void kickAfterCommit() {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    gradingWorker.kick();
                }
            });
            return;
        }
        gradingWorker.kick();
    }

    // ------------------------------------------------------------------ MP-06

    @Override
    @Transactional(readOnly = true)
    public ModulePracticeResponses.AnswerHistory history(Long userId, Long sessionId, Long sessionQuestionId) {
        QuestionPracticeSession session = sessions.findOwned(sessionId, userId)
                .orElseThrow(() -> new ResourceNotFoundException(ResponseCode.PRACTICE_SESSION_NOT_FOUND,
                        "Practice session not found"));
        support.requireModuleAccess(userId, session);
        QuestionPracticeSessionQuestion sessionQuestion = sessionQuestions.findInSession(sessionId, sessionQuestionId)
                .orElseThrow(() -> new ResourceNotFoundException(
                        "Question is not part of this practice session"));
        List<QuestionPracticeAnswer> stored =
                answers.findBySessionQuestion_SessionQuestionIdOrderByAttemptNumberAsc(sessionQuestionId);
        return new ModulePracticeResponses.AnswerHistory(
                sessionId,
                sessionQuestionId,
                sessionQuestion.getQuestion().getQuestionId(),
                sessionQuestion.getAttemptCount(),
                stored.stream().map(support::answerOf).toList());
    }
}
