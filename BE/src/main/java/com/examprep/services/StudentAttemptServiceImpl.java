package com.examprep.services;

import com.examprep.dto.PageResponse;
import com.examprep.dto.ResponseCode;
import com.examprep.dto.attempt.AttemptRequests;
import com.examprep.dto.attempt.AttemptResponses;
import com.examprep.dto.attempt.Snapshots;
import com.examprep.entities.AnswerOption;
import com.examprep.entities.AttemptAnswer;
import com.examprep.entities.AttemptStartKey;
import com.examprep.entities.Enrollment;
import com.examprep.entities.Exam;
import com.examprep.entities.ExamAttempt;
import com.examprep.entities.Question;
import com.examprep.entities.QuestionGroup;
import com.examprep.entities.QuizGenerationJob;
import com.examprep.entities.User;
import com.examprep.exceptions.BadRequestException;
import com.examprep.exceptions.BaseException;
import com.examprep.exceptions.ForbiddenException;
import com.examprep.exceptions.ResourceConflictException;
import com.examprep.exceptions.ResourceNotFoundException;
import com.examprep.repositories.AttemptAnswerRepository;
import com.examprep.repositories.AttemptStartKeyRepository;
import com.examprep.repositories.EnrollmentRepository;
import com.examprep.repositories.ExamAttemptRepository;
import com.examprep.repositories.ExamRepository;
import com.examprep.repositories.QuestionRepository;
import com.examprep.repositories.QuizGenerationJobRepository;
import com.examprep.repositories.UserRepository;
import com.examprep.util.attempt.AttemptGrader;
import com.examprep.util.attempt.AttemptScoring;
import com.examprep.util.attempt.AttemptShuffler;
import com.examprep.util.attempt.AnswerResponseValidator;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.EntityManager;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;

/**
 * The seven student attempt APIs (spec 6.1-6.5, 5.2).
 *
 * <p>Contract highlights enforced here:</p>
 * <ul>
 *   <li>ownership or enrollment is checked before anything is read or written (spec 0.3 rule 1);</li>
 *   <li>the paper and every answer come from the attempt's own snapshots, never from live exam or
 *       question data (spec 0.3 rules 3-6);</li>
 *   <li>no AI, no I/O inside a transaction (spec 0.3 rule 7);</li>
 *   <li>nothing is thrown as 500 that is a business rule (spec 0.3 rule 10).</li>
 * </ul>
 */
@Service
@RequiredArgsConstructor
public class StudentAttemptServiceImpl implements StudentAttemptService {

    private static final String STATUS_IN_PROGRESS = "IN_PROGRESS";
    private static final String GRADING_AI_GRADED = "AI_GRADED";
    private static final String GRADING_AUTO = "AUTO";

    /** A brand new row never had a draft; -1 lets a client whose first seq is 0 save it. */
    private static final int DRAFT_SEQ_EMPTY = -1;
    private static final int IDEMPOTENCY_KEY_MAX = 128;
    private static final int MAX_PAGE_SIZE = 100;

    private static final Set<String> PRACTICE_MODES = Set.of(
            "PRACTICE", "PRACTICE_EXAM", "SMART_PRACTICE", "MATERIAL_QUIZ");

    private final ExamRepository exams;
    private final UserRepository users;
    private final EnrollmentRepository enrollments;
    private final ExamAttemptRepository attempts;
    private final AttemptAnswerRepository answers;
    private final AttemptStartKeyRepository startKeys;
    private final QuestionRepository questions;
    private final QuizGenerationJobRepository quizJobs;
    private final AttemptPaperFactory paperFactory;
    private final AttemptAutoSubmitter autoSubmitter;
    private final AttemptWriter writer;
    private final ObjectMapper objectMapper;
    private final CodeAnswerJudge codeJudge;
    private final PlatformTransactionManager transactionManager;
    private final EntityManager entityManager;

    // ---------------------------------------------------------------------------------
    // SA-01
    // ---------------------------------------------------------------------------------

    /**
     * Starts an attempt (spec 6.1). One transaction writes {@code exam_attempts} with its
     * {@code exam_snapshot} and one {@code attempt_answers} row per question with its
     * {@code display_snapshot}, {@code key_snapshot}, {@code weight_snapshot} and
     * {@code question_version}. Question and option order come from the attempt's own seed.
     */
    @Override
    public AttemptResponses.Session start(Long userId, Long examId, String idempotencyKey) {
        TransactionTemplate tx = new TransactionTemplate(transactionManager);
        while (true) {
            StartResult result = tx.execute(status -> startAttempt(userId, examId, idempotencyKey));
            if (result.expiredAttemptId() == null) {
                return result.session();
            }
            autoSubmitter.closeExpired(result.expiredAttemptId(), userId, Instant.now());
        }
    }

    private record StartResult(AttemptResponses.Session session, Long expiredAttemptId) {}

    private StartResult startAttempt(Long userId, Long examId, String idempotencyKey) {
        Exam exam = exams.findById(examId)
                .orElseThrow(() -> new ResourceNotFoundException("Exam not found"));
        requireEnrollment(exam, userId);
        if (Exam.MODE_CONTEST.equals(exam.getMode())) {
            throw new ForbiddenException("Contest exams can only be taken through their contest");
        }
        // PQ-01 / AI-01 exams belong to the student who generated them.
        if (!Exam.MODE_EXAM.equals(exam.getMode()) && !exam.getCreatedBy().getUserId().equals(userId)) {
            throw new ForbiddenException("This practice exam belongs to another student");
        }

        Instant now = Instant.now();
        // Serializes concurrent "start" calls of the same student before the single-attempt check.
        User student = users.findForUpdate(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User not found"));
        String key = idempotencyKey(idempotencyKey);

        if (key != null) {
            Optional<AttemptStartKey> stored = startKeys.findByUserUserIdAndIdempotencyKey(userId, key);
            if (stored.isPresent()) {
                AttemptStartKey row = stored.get();
                if (row.getExpiresAt() != null && row.getExpiresAt().isBefore(now)) {
                    startKeys.delete(row);
                    startKeys.flush();
                } else {
                    ExamAttempt replayed = attempts.findById(row.getAttempt().getAttemptId()).orElse(null);
                    if (replayed == null) {
                        startKeys.delete(row);
                        startKeys.flush();
                    } else if (!examId.equals(replayed.getExam().getExamId())) {
                        throw new ResourceConflictException("Idempotency-Key was already used for another exam");
                    } else {
                        // Same key, same exam: replay the original 201, no second attempt.
                        return new StartResult(sessionView(replayed,
                                answers.findByAttemptIdOrdered(replayed.getAttemptId()), false), null);
                    }
                }
            }
        }

        if (!exam.isVisibleToStudents()) {
            throw new ResourceConflictException("Exam is not published");
        }

        ExamAttempt locked = attempts.findActiveAttemptId(examId, userId)
                .flatMap(attempts::lockById)
                .orElse(null);
        if (locked != null) {
            entityManager.refresh(locked);
        }
        if (locked != null && STATUS_IN_PROGRESS.equals(locked.getStatus())) {
            if (!autoSubmitter.isExpired(locked, now) || autoSubmitter.codeJudgingInProgress(locked, now)) {
                throw new BaseException(ResponseCode.ATTEMPT_IN_PROGRESS,
                        "An attempt is already in progress for this exam",
                        new AttemptResponses.AttemptInProgress(locked.getAttemptId(), locked.getDeadlineAt()));
            }
            List<AttemptAnswer> activeRows = answers.findByAttemptIdOrdered(locked.getAttemptId());
            if (autoSubmitter.hasUngradedCode(activeRows)) {
                return new StartResult(null, locked.getAttemptId());
            }
            autoSubmitter.gradeAndClose(locked, activeRows, now);
        }

        long seed = AttemptShuffler.newSeed();
        AttemptShuffler shuffler = new AttemptShuffler(seed);
        AttemptPaperFactory.Paper paper = paperFactory.resolve(exam, shuffler, seed);

        List<Question> paperQuestions = new ArrayList<>();
        for (AttemptPaperFactory.Item item : paper.items()) {
            paperQuestions.add(item.question());
        }
        Map<Long, List<AnswerOption>> options = paperFactory.optionsOf(paperQuestions);
        Map<Long, QuestionGroup> groups = paperFactory.groupsOf(paperQuestions);

        ExamAttempt attempt = ExamAttempt.builder()
                .exam(exam)
                .user(student)
                .startTime(now)
                .deadlineAt(now.plus(exam.getDurationMinutes() == null ? 0 : exam.getDurationMinutes(), ChronoUnit.MINUTES))
                .status(STATUS_IN_PROGRESS)
                .mode(exam.getMode())
                .autoSubmitted(false)
                .examSnapshot(paperFactory.write(new Snapshots.ExamSnapshot(
                        examId, exam.getTitle(), exam.getMaxScore(), exam.getDurationMinutes(),
                        seed, paper.items().size())))
                .build();
        attempts.save(attempt);
        attempts.flush();

        List<AttemptAnswer> rows = new ArrayList<>();
        int order = 1;
        for (AttemptPaperFactory.Item item : paper.items()) {
            Question question = item.question();
            List<AnswerOption> questionOptions = options.getOrDefault(question.getQuestionId(), List.of());
            Snapshots.KeySnapshot keySnapshot = paperFactory.key(question, questionOptions);
            Snapshots.DisplayQuestion display = paperFactory.display(
                    question, keySnapshot, questionOptions, order++, shuffler, paperFactory.groupFor(question, groups));
            rows.add(AttemptAnswer.builder()
                    .attempt(attempt)
                    .question(question)
                    .displaySnapshot(paperFactory.write(display))
                    .keySnapshot(paperFactory.write(keySnapshot))
                    .draftSeq(DRAFT_SEQ_EMPTY)
                    .weightSnapshot(item.weight())
                    .questionVersion(question.getScoringVersion() == null ? 1 : question.getScoringVersion())
                    .gradingStatus(GRADING_AUTO)
                    .build());
        }
        answers.saveAll(rows);

        if (key != null) {
            startKeys.save(AttemptStartKey.builder()
                    .user(student)
                    .idempotencyKey(key)
                    .attempt(attempt)
                    .createdAt(now)
                    .expiresAt(now.plus(24, ChronoUnit.HOURS))
                    .build());
        }

        return new StartResult(sessionView(attempt, rows, false), null);
    }

    // ---------------------------------------------------------------------------------
    // SA-02
    // ---------------------------------------------------------------------------------

    /**
     * Reloads the attempt (spec 6.2). A still-running attempt whose deadline has passed is closed
     * first, so the student sees the real status instead of an attempt
     * that can never be saved to again. Closing happens before the response is built, so the
     * entity the view reads already carries the final score and status.
     */
    @Override
    public AttemptResponses.Session get(Long userId, Long attemptId) {
        autoSubmitter.closeExpired(attemptId, userId, Instant.now());
        TransactionTemplate read = new TransactionTemplate(transactionManager);
        read.setReadOnly(true);
        return read.execute(status -> sessionView(ownedAttempt(userId, attemptId),
                answers.findByAttemptIdOrdered(attemptId), true));
    }

    // ---------------------------------------------------------------------------------
    // SA-03
    // ---------------------------------------------------------------------------------

    /**
     * Saves a batch of drafts (spec 6.3). The transactional work happens in {@link AttemptWriter};
     * when the deadline has passed, this method auto-submits before reporting
     * {@code 410 ATTEMPT_EXPIRED}.
     */
    @Override
    public AttemptResponses.DraftSaved saveDrafts(Long userId, Long attemptId, AttemptRequests.DraftSave body) {
        Optional<AttemptResponses.DraftSaved> outcome = writer.saveDrafts(userId, attemptId, body);
        if (outcome.isEmpty()) {
            autoSubmitter.closeExpired(attemptId, userId, Instant.now());
            throw new BaseException(ResponseCode.ATTEMPT_EXPIRED, "The attempt deadline has passed");
        }
        return outcome.get();
    }

    // ---------------------------------------------------------------------------------
    // SA-04
    // ---------------------------------------------------------------------------------

    @Override
    public AttemptResponses.Submitted submit(Long userId, Long attemptId, AttemptRequests.Submit body) {
        return writer.submit(userId, attemptId, body);
    }

    // ---------------------------------------------------------------------------------
    // SA-05
    // ---------------------------------------------------------------------------------

    /**
     * The graded result (spec 6.5). Correct answers only appear here, and only as the text of a
     * choice question's options; the original rubric, the sample diagram and the raw answer key
     * never leave the server (spec 0.3 rules 4-5).
     */
    @Override
    @Transactional(readOnly = true)
    public AttemptResponses.Result result(Long userId, Long attemptId) {
        ExamAttempt attempt = ownedAttempt(userId, attemptId);
        if (STATUS_IN_PROGRESS.equals(attempt.getStatus())) {
            throw new BaseException(ResponseCode.ATTEMPT_NOT_SUBMITTED,
                    "Attempt has not been submitted yet",
                    new AttemptResponses.NotSubmitted(STATUS_IN_PROGRESS));
        }

        List<AttemptAnswer> rows = answers.findByAttemptIdOrdered(attemptId);
        Map<Long, Question> live = liveQuestions(rows);

        Snapshots.ExamSnapshot exam = paperFactory.read(attempt.getExamSnapshot(), Snapshots.ExamSnapshot.class);
        BigDecimal maxScore = exam != null && exam.maxScore() != null
                ? exam.maxScore() : (attempt.getExam() != null ? attempt.getExam().getMaxScore() : BigDecimal.valueOf(rows.size()));
        String title = exam != null && exam.title() != null ? exam.title() : (attempt.getExam() != null ? attempt.getExam().getTitle() : "Review Practice");

        BigDecimal totalWeight = AttemptScoring.totalWeight(weights(rows));
        BigDecimal pendingWeight = BigDecimal.ZERO;
        for (AttemptAnswer row : rows) {
            if (row.getScoreEarned() == null && row.getWeightSnapshot() != null && row.getWeightSnapshot().signum() > 0) {
                pendingWeight = pendingWeight.add(row.getWeightSnapshot());
            }
        }

        List<AttemptResponses.ResultQuestion> questions = new ArrayList<>();
        int position = 1;
        for (AttemptAnswer row : rows) {
            Snapshots.DisplayQuestion display = display(row, live, position++);
            Snapshots.KeySnapshot key = paperFactory.read(row.getKeySnapshot(), Snapshots.KeySnapshot.class);
            // Criteria split the unrounded P_q so their internal precision stays at four digits.
            BigDecimal rawMaxPoints = AttemptScoring.questionMaxPoints(
                    row.getWeightSnapshot(), totalWeight, maxScore);
            boolean rubricType = AttemptGrader.isRubricType(display.questionType());
            questions.add(new AttemptResponses.ResultQuestion(
                    display.questionId(),
                    display.orderIndex(),
                    display.questionType(),
                    display.content(),
                    reviewOptions(display, key),
                    paperFactory.readResponse(row.getResponse()),
                    row.getIsCorrect(),
                    AttemptScoring.output(rawMaxPoints),
                    AttemptScoring.output(row.getScoreEarned()),
                    AttemptScoring.output(row.getWeightSnapshot()),
                    row.getGradingStatus(),
                    row.getGradingError(),
                    rubricType ? criteria(row, key, rawMaxPoints) : null,
                    GRADING_AI_GRADED.equals(row.getGradingStatus()) ? overallFeedback(row) : null,
                    explanation(live.get(display.questionId())),
                    correctAnswer(display.questionType(), key)));
        }

        return new AttemptResponses.Result(
                attempt.getAttemptId(),
                title,
                attempt.getStatus(),
                AttemptScoring.output(attempt.getTotalScore()),
                AttemptScoring.output(AttemptScoring.pendingPoints(pendingWeight, totalWeight, maxScore)),
                AttemptScoring.output(maxScore),
                attempt.getSubmittedAt(),
                attempt.getAutoSubmitted(),
                questions,
                attempt.getMode(),
                quizJobId(attempt));
    }

    // ---------------------------------------------------------------------------------
    // SA-06
    // ---------------------------------------------------------------------------------

    /**
     * History of one exam (spec 5.2). The page comes from one database query and the weights are
     * aggregated with grouped queries, so a page never costs one query per row (spec 0.3 rule 9).
     */
    @Override
    @Transactional(readOnly = true)
    public PageResponse<AttemptResponses.HistoryItem> history(Long userId, Long examId, int page, int size) {
        if (page < 0 || size < 1 || size > MAX_PAGE_SIZE) {
            throw new BadRequestException(ResponseCode.VALIDATION_ERROR,
                    "page must be 0 or greater and size must be between 1 and 100");
        }
        Exam exam = exams.findById(examId)
                .orElseThrow(() -> new ResourceNotFoundException("Exam not found"));
        requireEnrollment(exam, userId);

        Page<ExamAttempt> result = attempts
                .findByUserUserIdAndExamExamIdOrderByStartTimeDescAttemptIdDesc(
                        userId, examId, PageRequest.of(page, size));

        List<Long> ids = result.getContent().stream().map(ExamAttempt::getAttemptId).toList();
        // An empty page must not run the grouped queries: an empty IN () list is not portable.
        Map<Long, BigDecimal> totalWeights = ids.isEmpty()
                ? Map.of() : weightSums(answers.sumWeightsByAttemptIds(ids));
        Map<Long, BigDecimal> pendingWeights = ids.isEmpty()
                ? Map.of() : weightSums(answers.sumPendingWeightsByAttemptIds(ids));

        List<AttemptResponses.HistoryItem> content = new ArrayList<>();
        for (ExamAttempt attempt : result.getContent()) {
            Snapshots.ExamSnapshot snapshot =
                    paperFactory.read(attempt.getExamSnapshot(), Snapshots.ExamSnapshot.class);
            BigDecimal maxScore = snapshot != null && snapshot.maxScore() != null
                    ? snapshot.maxScore()
                    : (attempt.getExam() != null && attempt.getExam().getMaxScore() != null
                            ? attempt.getExam().getMaxScore()
                            : BigDecimal.ZERO);
            Long attemptId = attempt.getAttemptId();
            content.add(new AttemptResponses.HistoryItem(
                    attemptId,
                    attempt.getStatus(),
                    AttemptScoring.output(attempt.getTotalScore()),
                    AttemptScoring.output(AttemptScoring.pendingPoints(
                            pendingWeights.getOrDefault(attemptId, BigDecimal.ZERO),
                            totalWeights.getOrDefault(attemptId, BigDecimal.ZERO),
                            maxScore)),
                    AttemptScoring.output(maxScore),
                    attempt.getStartTime(),
                    attempt.getSubmittedAt(),
                    attempt.getAutoSubmitted()));
        }
        return PageResponse.of(result, content);
    }

    // ---------------------------------------------------------------------------------
    // SA-07
    // ---------------------------------------------------------------------------------

    /**
     * Cancels an attempt the student no longer wants to keep. The row, its frozen paper, its
     * drafts and its idempotency key are deleted in this one transaction, so nothing of the
     * attempt is left behind: it never shows up in the history and the student can start the
     * exam again. A closed attempt (submitted or auto-submitted) is a result, not a draft, and
     * can never be cancelled.
     */
    @Override
    @Transactional
    public AttemptResponses.Cancelled cancel(Long userId, Long attemptId) {
        ExamAttempt attempt = attempts.lockById(attemptId)
                .orElseThrow(() -> new ResourceNotFoundException("Attempt not found"));
        if (!Objects.equals(attempt.getUser().getUserId(), userId)) {
            throw new ForbiddenException("Attempt belongs to another student");
        }
        if (!STATUS_IN_PROGRESS.equals(attempt.getStatus())) {
            throw new ResourceConflictException("Attempt has already been submitted");
        }
        if (autoSubmitter.codeJudgingInProgress(attempt, Instant.now())) {
            throw new ResourceConflictException("Code judging is already in progress");
        }

        Long examId = attempt.getExam() != null ? attempt.getExam().getExamId() : null;
        // Children first: nothing of this attempt survives, neither answer nor start key. Each
        // flush makes sure the rows are really gone before the parent attempt is deleted.
        answers.deleteAll(answers.findByAttempt_AttemptId(attemptId));
        answers.flush();
        startKeys.deleteAll(startKeys.findByAttempt_AttemptId(attemptId));
        startKeys.flush();
        attempts.delete(attempt);
        return new AttemptResponses.Cancelled(attemptId, examId);
    }

    @Override
    @Transactional
    public void acknowledgeReview(Long userId, Long attemptId) {
        ExamAttempt attempt = attempts.lockById(attemptId)
                .orElseThrow(() -> new ResourceNotFoundException("Attempt not found"));
        if (!Objects.equals(attempt.getUser().getUserId(), userId)) {
            throw new ForbiddenException("Attempt belongs to another student");
        }
        if (!"REVIEW".equals(attempt.getMode()) && !Exam.MODE_PRACTICE_EXAM.equals(attempt.getMode())) {
            throw new BadRequestException("Attempt is not a review session");
        }
        if (!"COMPLETED".equals(attempt.getStatus()) && !"SUBMITTED".equals(attempt.getStatus())) {
            throw new ResourceConflictException("Review session has not been completed or submitted yet");
        }

        answers.deleteAll(answers.findByAttempt_AttemptId(attemptId));
        answers.flush();
        startKeys.deleteAll(startKeys.findByAttempt_AttemptId(attemptId));
        startKeys.flush();
        attempts.delete(attempt);
    }

    // ---------------------------------------------------------------------------------
    // SA-Practice: Instant answer check
    // ---------------------------------------------------------------------------------

    /**
     * SA-Practice: checks a single question's answer immediately on a practice attempt and locks it.
     */
    @Override
    @Transactional
    public AttemptResponses.CheckResult checkAnswer(Long userId, Long attemptId, Long questionId, AttemptRequests.Check body) {
        ExamAttempt attempt = attempts.lockById(attemptId)
                .orElseThrow(() -> new ResourceNotFoundException("Attempt not found"));
        if (!Objects.equals(attempt.getUser().getUserId(), userId)) {
            throw new ForbiddenException("Attempt belongs to another student");
        }
        if (!STATUS_IN_PROGRESS.equals(attempt.getStatus())) {
            throw new BaseException(ResponseCode.ATTEMPT_NOT_IN_PROGRESS, "Attempt is not in progress");
        }
        Instant now = Instant.now();
        if (autoSubmitter.isExpired(attempt, now)) {
            throw new BaseException(ResponseCode.ATTEMPT_NOT_IN_PROGRESS, "Attempt is not in progress");
        }
        if ("MATERIAL_QUIZ".equals(attempt.getMode()) && "EXAM".equals(attempt.getTakeAs())) {
            throw new ForbiddenException("Check answer is not available when taking as exam");
        }
        if (attempt.getMode() == null || !PRACTICE_MODES.contains(attempt.getMode())) {
            throw new BaseException(ResponseCode.NOT_A_PRACTICE_EXAM, "This endpoint is only available for practice exams");
        }

        AttemptAnswer row = answers.findByAttemptIdAndQuestionId(attemptId, questionId)
                .orElseThrow(() -> new ResourceNotFoundException("Question is not part of this attempt"));

        // Idempotency: if already locked and cached, return cached verdict unchanged
        if (Boolean.TRUE.equals(row.getIsLocked()) && row.getCheckResult() != null && !row.getCheckResult().isBlank()) {
            try {
                return objectMapper.readValue(row.getCheckResult(), AttemptResponses.CheckResult.class);
            } catch (Exception e) {
                // fall through to recalculate if corrupted
            }
        }

        Snapshots.DisplayQuestion display =
                paperFactory.read(row.getDisplaySnapshot(), Snapshots.DisplayQuestion.class);
        String questionType = paperFactory.questionType(row, display);
        if ("CODE".equals(questionType) && row.getGradedAt() != null) {
            throw new ResourceConflictException("Coding answers are final once judged");
        }

        JsonNode responseNode;
        boolean responseUpdated = false;
        if (body != null && body.response() != null) {
            Optional<String> error = AnswerResponseValidator.validate(questionType, body.response(), display);
            if (error.isEmpty() && "CODE".equals(questionType)) {
                error = codeJudge.draftLanguageError(questionId, body.response());
            }
            if (error.isPresent()) {
                throw new BadRequestException(error.get());
            }
            responseNode = normalizeResponse(questionId, questionType, body.response());
            row.setResponse(storeResponse(responseNode));
            responseUpdated = true;
        } else if (row.getResponse() != null) {
            responseNode = paperFactory.readResponse(row.getResponse());
            Optional<String> error = AnswerResponseValidator.validate(questionType, responseNode, display);
            if (error.isPresent()) {
                throw new BadRequestException(error.get());
            }
            responseNode = normalizeResponse(questionId, questionType, responseNode);
        } else {
            responseNode = null;
        }

        boolean supported = AttemptGrader.isAutoGraded(questionType);
        AttemptResponses.CheckResult result;
        if (!supported) {
            result = new AttemptResponses.CheckResult(false, null, List.of(), null, null);
            if (responseUpdated) {
                answers.save(row);
            }
            return result;
        }

        Snapshots.KeySnapshot key = paperFactory.read(row.getKeySnapshot(), Snapshots.KeySnapshot.class);
        AttemptGrader.Grade grade = AttemptGrader.grade(questionType, responseNode, key, row.getWeightSnapshot());
        List<Long> correctOptionIds = isChoice(questionType) && key != null && key.correctOptionIds() != null
                ? key.correctOptionIds()
                : List.of();
        AttemptResponses.CorrectAnswer correctAnswer = correctAnswer(questionType, key);
        if (correctAnswer == null && isChoice(questionType)) {
            correctAnswer = new AttemptResponses.CorrectAnswer(null, null, null);
        }
        String explanation = hasManagerExplanation(row.getQuestion())
                ? row.getQuestion().getAiExplanation()
                : null;
        result = new AttemptResponses.CheckResult(true, grade.correct(), correctOptionIds, correctAnswer, explanation);

        row.setIsLocked(true);
        try {
            row.setCheckResult(objectMapper.writeValueAsString(result));
        } catch (Exception e) {
            throw new BaseException(ResponseCode.INTERNAL_SERVER_ERROR, "Failed to serialize check result");
        }
        answers.save(row);

        return result;
    }

    private JsonNode normalizeResponse(Long questionId, String questionType, JsonNode response) {
        if (!"CODE".equals(questionType) || response == null || !response.isObject()
                || response.path("text").asText("").isBlank() || response.hasNonNull("language")) {
            return response;
        }
        com.fasterxml.jackson.databind.node.ObjectNode code = response.deepCopy();
        code.put("language", codeJudge.language(questionId));
        return code;
    }

    private String storeResponse(JsonNode response) {
        if (AnswerResponseValidator.isEmpty(response)) {
            return null;
        }
        return paperFactory.writeResponse(response);
    }

    /**
     * Key of one practice question, built like the check verdict so the client's instant reveal and
     * the stored check agree; null for the rubric types, graded only after submitting.
     */
    private AttemptResponses.PracticeKey practiceKey(AttemptAnswer row, String questionType, Question live) {
        if (!AttemptGrader.isAutoGraded(questionType)) {
            return null;
        }
        Snapshots.KeySnapshot key = paperFactory.read(row.getKeySnapshot(), Snapshots.KeySnapshot.class);
        if (key == null) {
            return null;
        }
        List<Long> correctOptionIds = isChoice(questionType) && key.correctOptionIds() != null
                ? key.correctOptionIds()
                : List.of();
        String explanation = hasManagerExplanation(live)
                ? live.getAiExplanation()
                : null;
        return new AttemptResponses.PracticeKey(correctOptionIds, correctAnswer(questionType, key), explanation);
    }

    private boolean isChoice(String questionType) {
        return "SINGLE_CHOICE".equals(questionType)
                || "MULTIPLE_CHOICE".equals(questionType)
                || "TRUE_FALSE".equals(questionType);
    }

    // ---------------------------------------------------------------------------------
    // shared helpers
    // ---------------------------------------------------------------------------------

    /** Only an ACTIVE enrollment opens the door to a course's exams (spec 0.3 rule 1). */
    private void requireEnrollment(Exam exam, Long userId) {
        Long courseId = exam.getCourse() != null ? exam.getCourse().getCourseId()
                : exam.getModule() != null && exam.getModule().getCourse() != null
                ? exam.getModule().getCourse().getCourseId() : null;
        // A material quiz of no course: only the student who generated it takes it.
        if (courseId == null && Exam.MODE_MATERIAL_QUIZ.equals(exam.getMode())
                && exam.getCreatedBy() != null && Objects.equals(exam.getCreatedBy().getUserId(), userId)) {
            return;
        }
        if (courseId == null
                || !enrollments.existsByCourse_CourseIdAndUser_UserIdAndStatus(courseId, userId, Enrollment.STATUS_ACTIVE)) {
            throw new ForbiddenException("You are not enrolled in the course of this exam");
        }
    }

    private ExamAttempt ownedAttempt(Long userId, Long attemptId) {
        ExamAttempt attempt = attempts.findById(attemptId)
                .orElseThrow(() -> new ResourceNotFoundException("Attempt not found"));
        if (!Objects.equals(attempt.getUser().getUserId(), userId)) {
            throw new ForbiddenException("Attempt belongs to another student");
        }
        return attempt;
    }

    private String idempotencyKey(String header) {
        if (header == null) {
            return null;
        }
        String key = header.strip();
        if (key.isEmpty()) {
            return null;
        }
        if (key.length() > IDEMPOTENCY_KEY_MAX) {
            throw new BadRequestException(ResponseCode.VALIDATION_ERROR,
                    "Idempotency-Key must be at most 128 characters");
        }
        return key;
    }

    /** SA-01/SA-02 body. {@code withAnswers} is SA-02 only (spec 6.2). */
    private AttemptResponses.Session sessionView(ExamAttempt attempt, List<AttemptAnswer> rows, boolean withAnswers) {
        Snapshots.ExamSnapshot exam = paperFactory.read(attempt.getExamSnapshot(), Snapshots.ExamSnapshot.class);
        BigDecimal maxScore = exam != null && exam.maxScore() != null
                ? exam.maxScore() : (attempt.getExam() != null ? attempt.getExam().getMaxScore() : BigDecimal.valueOf(rows.size()));
        String title = exam != null && exam.title() != null ? exam.title() : (attempt.getExam() != null ? attempt.getExam().getTitle() : "Review Practice");
        Long examId = attempt.getExam() != null ? attempt.getExam().getExamId() : null;

        Map<Long, Question> live = liveQuestions(rows);
        BigDecimal totalWeight = AttemptScoring.totalWeight(weights(rows));
        // Practice reveals each answer at once, so its paper carries the key; an exam never does.
        boolean practice = attempt.getMode() != null && PRACTICE_MODES.contains(attempt.getMode());
        if ("MATERIAL_QUIZ".equals(attempt.getMode()) && "EXAM".equals(attempt.getTakeAs())) {
            practice = false;
        }

        List<AttemptResponses.Question> questions = new ArrayList<>();
        List<AttemptResponses.Answer> drafts = withAnswers ? new ArrayList<>() : null;
        int position = 1;
        for (AttemptAnswer row : rows) {
            Snapshots.DisplayQuestion display = display(row, live, position++);
            questions.add(new AttemptResponses.Question(
                    display.questionId(),
                    display.orderIndex(),
                    display.questionType(),
                    display.content(),
                    options(display),
                    matching(display),
                    AttemptScoring.output(
                            AttemptScoring.questionMaxPoints(row.getWeightSnapshot(), totalWeight, maxScore)),
                    display.answerSpace() == null ? null
                            : new AttemptResponses.AnswerSpace(
                                    display.answerSpace().maxLength(),
                                    display.answerSpace().minWords(),
                                    display.answerSpace().maxWords()),
                    group(display),
                    practice ? practiceKey(row, display.questionType(), live.get(display.questionId())) : null));
            if (withAnswers) {
                AttemptResponses.CheckResult check = null;
                if (row.getCheckResult() != null && !row.getCheckResult().isBlank()) {
                    try {
                        check = objectMapper.readValue(row.getCheckResult(), AttemptResponses.CheckResult.class);
                    } catch (Exception e) {
                        // ignore deserialization failure
                    }
                }
                drafts.add(new AttemptResponses.Answer(
                        display.questionId(), row.getDraftSeq(), paperFactory.readResponse(row.getResponse()), check));
            }
        }

        return new AttemptResponses.Session(
                attempt.getAttemptId(),
                examId,
                title,
                attempt.getStatus(),
                attempt.getStartTime(),
                attempt.getDeadlineAt(),
                Instant.now(),
                maxScore,
                questions,
                drafts == null ? null : List.copyOf(drafts),
                attempt.getMode(),
                quizJobId(attempt),
                attempt.getTakeAs());
    }

    /**
     * The generation job behind a material quiz, so the client can resume it with MQ-05 instead of
     * starting a fresh attempt through SA-01. Derived from the result exam, which also covers
     * attempts opened through SA-01 directly.
     */
    private Long quizJobId(ExamAttempt attempt) {
        if (!Exam.MODE_MATERIAL_QUIZ.equals(attempt.getMode()) || attempt.getExam() == null) {
            return null;
        }
        return quizJobs.findFirstByResultExamExamIdAndUserUserIdOrderByJobIdDesc(
                        attempt.getExam().getExamId(), attempt.getUser().getUserId())
                .map(QuizGenerationJob::getJobId)
                .orElse(null);
    }

    private List<BigDecimal> weights(List<AttemptAnswer> rows) {
        List<BigDecimal> weights = new ArrayList<>();
        for (AttemptAnswer row : rows) {
            weights.add(row.getWeightSnapshot());
        }
        return weights;
    }

    /** One query for the whole attempt: explanations come from the question cache (SA-05). */
    private Map<Long, Question> liveQuestions(List<AttemptAnswer> rows) {
        Set<Long> ids = new HashSet<>();
        for (AttemptAnswer row : rows) {
            ids.add(row.getQuestion().getQuestionId());
        }
        if (ids.isEmpty()) {
            return Map.of();
        }
        Map<Long, Question> live = new HashMap<>();
        for (Question question : questions.findAllByQuestionIdIn(ids)) {
            live.put(question.getQuestionId(), question);
        }
        return live;
    }

    private Snapshots.DisplayQuestion display(AttemptAnswer row, Map<Long, Question> live, int position) {
        Snapshots.DisplayQuestion display =
                paperFactory.read(row.getDisplaySnapshot(), Snapshots.DisplayQuestion.class);
        if (display != null) {
            return display;
        }
        // Only reachable with a hand-corrupted row: render the live question without answers.
        Question question = live.get(row.getQuestion().getQuestionId());
        if (question == null) {
            throw new BaseException(ResponseCode.INTERNAL_SERVER_ERROR, "Attempt answer has no display snapshot");
        }
        return new Snapshots.DisplayQuestion(question.getQuestionId(), position, question.getQuestionType(),
                question.getContent(), null, null, null, null);
    }

    /** The group passage exactly as the attempt froze it; null for a standalone question. */
    private AttemptResponses.Group group(Snapshots.DisplayQuestion display) {
        Snapshots.DisplayGroup group = display.group();
        return group == null ? null
                : new AttemptResponses.Group(group.groupId(), group.title(), group.passageText());
    }

    private List<AttemptResponses.Option> options(Snapshots.DisplayQuestion display) {
        if (display.options() == null || display.options().isEmpty()) {
            return null;
        }
        List<AttemptResponses.Option> options = new ArrayList<>();
        for (Snapshots.DisplayOption option : display.options()) {
            options.add(new AttemptResponses.Option(option.optionId(), option.optionText(), null));
        }
        return options;
    }

    /** Options with the correct-answer flag, taken from {@code key_snapshot} (spec 6.5). */
    /** SA-05 only: the key of ORDERING / MATCHING / FILL_BLANK, which their options cannot carry. */
    private AttemptResponses.CorrectAnswer correctAnswer(String questionType, Snapshots.KeySnapshot key) {
        if (key == null || questionType == null) {
            return null;
        }
        switch (questionType) {
            case "ORDERING":
                return key.correctOrder() == null || key.correctOrder().isEmpty() ? null
                        : new AttemptResponses.CorrectAnswer(key.correctOrder(), null, null);
            case "MATCHING":
                if (key.pairs() == null || key.pairs().isEmpty()) {
                    return null;
                }
                List<AttemptResponses.MatchPair> pairs = new ArrayList<>();
                for (Snapshots.Pair pair : key.pairs()) {
                    pairs.add(new AttemptResponses.MatchPair(pair.left(), pair.right()));
                }
                return new AttemptResponses.CorrectAnswer(null, pairs, null);
            case "FILL_BLANK":
                if (key.blanks() == null || key.blanks().isEmpty()) {
                    return null;
                }
                Map<String, List<String>> blanks = new LinkedHashMap<>();
                for (Snapshots.Blank blank : key.blanks()) {
                    if (blank != null && blank.index() != null) {
                        blanks.put(String.valueOf(blank.index()), blank.accepted() == null ? List.of() : blank.accepted());
                    }
                }
                return new AttemptResponses.CorrectAnswer(null, null, blanks);
            default:
                return null;
        }
    }

    private List<AttemptResponses.Option> reviewOptions(Snapshots.DisplayQuestion display,
                                                        Snapshots.KeySnapshot key) {
        if (display.options() == null || display.options().isEmpty()) {
            return null;
        }
        List<Long> correct = key == null ? null : key.correctOptionIds();
        List<AttemptResponses.Option> options = new ArrayList<>();
        for (Snapshots.DisplayOption option : display.options()) {
            Boolean isCorrectAnswer = correct == null ? null : correct.contains(option.optionId());
            options.add(new AttemptResponses.Option(option.optionId(), option.optionText(), isCorrectAnswer));
        }
        return options;
    }

    private AttemptResponses.Matching matching(Snapshots.DisplayQuestion display) {
        return display.matching() == null ? null
                : new AttemptResponses.Matching(display.matching().lefts(), display.matching().rights());
    }

    /** Criteria with points; only for rubric questions graded by the worker (spec 6.5). */
    private List<AttemptResponses.Criterion> criteria(AttemptAnswer row,
                                                       Snapshots.KeySnapshot key,
                                                       BigDecimal maxPoints) {
        Snapshots.Rubric rubric = key == null ? null : key.rubric();
        if (rubric == null || rubric.criteria() == null || rubric.criteria().isEmpty()
                || !GRADING_AI_GRADED.equals(row.getGradingStatus())) {
            return List.of();
        }
        List<BigDecimal> criterionWeights = new ArrayList<>();
        for (Snapshots.Criterion criterion : rubric.criteria()) {
            criterionWeights.add(criterion.weight());
        }
        BigDecimal totalCriterionWeight = AttemptScoring.totalWeight(criterionWeights);
        Map<String, JsonNode> scores = criteriaScores(paperFactory.readResponse(row.getAiCriteriaScores()));

        List<AttemptResponses.Criterion> out = new ArrayList<>();
        for (Snapshots.Criterion criterion : rubric.criteria()) {
            JsonNode score = scores.get(criterion.criterionId());
            BigDecimal points = BigDecimal.ZERO;
            String feedback = null;
            if (score != null) {
                JsonNode value = score.get("points");
                if (value != null && value.isNumber()) {
                    points = AttemptScoring.output(new BigDecimal(value.toString()));
                }
                JsonNode text = score.get("feedback");
                if (text != null && text.isTextual()) {
                    feedback = text.asText();
                }
            }
            out.add(new AttemptResponses.Criterion(
                    criterion.criterionId(),
                    criterion.name(),
                    AttemptScoring.output(AttemptScoring.criterionMaxPoints(
                            maxPoints, criterion.weight(), totalCriterionWeight)),
                    points,
                    feedback));
        }
        return out;
    }

    /** The worker writes either {@code {criteria: [...]}} or a bare array; both are accepted. */
    private Map<String, JsonNode> criteriaScores(JsonNode stored) {
        Map<String, JsonNode> byCriterionId = new HashMap<>();
        JsonNode list = null;
        if (stored != null) {
            if (stored.isArray()) {
                list = stored;
            } else if (stored.isObject() && stored.get("criteria") != null && stored.get("criteria").isArray()) {
                list = stored.get("criteria");
            }
        }
        if (list == null) {
            return byCriterionId;
        }
        for (JsonNode item : list) {
            JsonNode id = item == null ? null : item.get("criterionId");
            if (id != null && id.isTextual()) {
                byCriterionId.put(id.asText(), item);
            }
        }
        return byCriterionId;
    }

    private String overallFeedback(AttemptAnswer row) {
        JsonNode stored = paperFactory.readResponse(row.getAiFeedbackJson());
        if (stored == null || stored.isNull()) {
            return null;
        }
        if (stored.isTextual()) {
            return stored.asText();
        }
        if (stored.isObject()) {
            for (String field : List.of("overallFeedback", "feedback", "text", "comment")) {
                JsonNode value = stored.get(field);
                if (value != null && value.isTextual() && !value.asText().isBlank()) {
                    return value.asText();
                }
            }
        }
        return null;
    }

    private boolean hasManagerExplanation(Question question) {
        if (question == null || question.getAiExplanation() == null || question.getAiExplanation().isBlank()) {
            return false;
        }
        String source = question.getAiExplanationSource();
        return source == null || source.isBlank() || "MANAGER".equals(source);
    }

    /**
     * Explanations on SA-05 are free manager-authored text only; AI-generated explanations go
     * through SE-01 so each student's quota is checked and charged on access.
     */
    private AttemptResponses.Explanation explanation(Question question) {
        if (!hasManagerExplanation(question)) {
            return null;
        }
        return new AttemptResponses.Explanation(question.getAiExplanation(), "MANAGER");
    }

    private Map<Long, BigDecimal> weightSums(List<Object[]> rows) {
        Map<Long, BigDecimal> sums = new HashMap<>();
        for (Object[] row : rows) {
            if (row == null || row.length < 2 || row[0] == null) {
                continue;
            }
            sums.put(((Number) row[0]).longValue(), decimal(row[1]));
        }
        return sums;
    }

    /** {@code SUM} may come back as BigDecimal, Double or Long depending on the driver. */
    private static BigDecimal decimal(Object value) {
        if (value == null) {
            return BigDecimal.ZERO;
        }
        if (value instanceof BigDecimal bigDecimal) {
            return bigDecimal;
        }
        if (value instanceof Number number) {
            return new BigDecimal(number.toString());
        }
        try {
            return new BigDecimal(value.toString());
        } catch (NumberFormatException e) {
            return BigDecimal.ZERO;
        }
    }
}
