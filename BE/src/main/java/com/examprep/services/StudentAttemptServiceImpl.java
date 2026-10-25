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
import com.examprep.repositories.UserRepository;
import com.examprep.util.attempt.AttemptGrader;
import com.examprep.util.attempt.AttemptScoring;
import com.examprep.util.attempt.AttemptShuffler;
import com.fasterxml.jackson.databind.JsonNode;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;

/**
 * The six student attempt APIs (spec 6.1-6.5, 5.2).
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
    private static final String STATUS_PUBLISHED = "PUBLISHED";
    private static final String GRADING_AI_GRADED = "AI_GRADED";
    private static final String GRADING_AUTO = "AUTO";

    /** A brand new row never had a draft; -1 lets a client whose first seq is 0 save it. */
    private static final int DRAFT_SEQ_EMPTY = -1;
    private static final int IDEMPOTENCY_KEY_MAX = 128;
    private static final int MAX_PAGE_SIZE = 100;

    private final ExamRepository exams;
    private final UserRepository users;
    private final EnrollmentRepository enrollments;
    private final ExamAttemptRepository attempts;
    private final AttemptAnswerRepository answers;
    private final AttemptStartKeyRepository startKeys;
    private final QuestionRepository questions;
    private final AttemptPaperFactory paperFactory;
    private final AttemptAutoSubmitter autoSubmitter;
    private final AttemptWriter writer;

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
    @Transactional
    public AttemptResponses.Session start(Long userId, Long examId, String idempotencyKey) {
        Exam exam = exams.findById(examId)
                .orElseThrow(() -> new ResourceNotFoundException("Exam not found"));
        requireEnrollment(exam, userId);

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
                        return sessionView(replayed, answers.findByAttemptIdOrdered(replayed.getAttemptId()), false);
                    }
                }
            }
        }

        if (!STATUS_PUBLISHED.equals(exam.getStatus())) {
            throw new ResourceConflictException("Exam is not published");
        }

        ExamAttempt active = attempts
                .findActiveAttempt(examId, userId, STATUS_IN_PROGRESS)
                .orElse(null);
        if (active != null) {
            ExamAttempt locked = attempts.lockById(active.getAttemptId()).orElse(active);
            if (autoSubmitter.isExpired(locked, now)) {
                // Deadline is long gone: close it so the student can start over.
                autoSubmitter.gradeAndClose(locked, answers.findByAttemptIdOrdered(locked.getAttemptId()), now);
            } else {
                throw new BaseException(ResponseCode.ATTEMPT_IN_PROGRESS,
                        "An attempt is already in progress for this exam",
                        new AttemptResponses.AttemptInProgress(locked.getAttemptId(), locked.getDeadlineAt()));
            }
        }

        long seed = AttemptShuffler.newSeed();
        AttemptShuffler shuffler = new AttemptShuffler(seed);
        AttemptPaperFactory.Paper paper = paperFactory.resolve(exam, shuffler, seed);

        List<Question> paperQuestions = new ArrayList<>();
        for (AttemptPaperFactory.Item item : paper.items()) {
            paperQuestions.add(item.question());
        }
        Map<Long, List<AnswerOption>> options = paperFactory.optionsOf(paperQuestions);

        ExamAttempt attempt = ExamAttempt.builder()
                .exam(exam)
                .user(student)
                .startTime(now)
                .deadlineAt(now.plus(exam.getDurationMinutes() == null ? 0 : exam.getDurationMinutes(), ChronoUnit.MINUTES))
                .status(STATUS_IN_PROGRESS)
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
            Snapshots.DisplayQuestion display =
                    paperFactory.display(question, keySnapshot, questionOptions, order++, shuffler);
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

        return sessionView(attempt, rows, false);
    }

    // ---------------------------------------------------------------------------------
    // SA-02
    // ---------------------------------------------------------------------------------

    /**
     * Reloads the attempt (spec 6.2). A still-running attempt whose deadline has passed is closed
     * first, in this same transaction, so the student sees the real status instead of an attempt
     * that can never be saved to again. Closing happens before the response is built, so the
     * entity the view reads already carries the final score and status.
     */
    @Override
    @Transactional
    public AttemptResponses.Session get(Long userId, Long attemptId) {
        ExamAttempt attempt = ownedAttempt(userId, attemptId);
        List<AttemptAnswer> rows = answers.findByAttemptIdOrdered(attemptId);
        if (STATUS_IN_PROGRESS.equals(attempt.getStatus()) && autoSubmitter.isExpired(attempt, Instant.now())) {
            autoSubmitter.gradeAndClose(attempt, rows, Instant.now());
        }
        return sessionView(attempt, rows, true);
    }

    // ---------------------------------------------------------------------------------
    // SA-03
    // ---------------------------------------------------------------------------------

    /**
     * Saves a batch of drafts (spec 6.3). The transactional work happens in {@link AttemptWriter};
     * when the deadline had already passed the writer closes the attempt and reports it, and the
     * caller answers {@code 410 ATTEMPT_EXPIRED} here — throwing from inside that transaction
     * would roll the closing back.
     */
    @Override
    public AttemptResponses.DraftSaved saveDrafts(Long userId, Long attemptId, AttemptRequests.DraftSave body) {
        Optional<AttemptResponses.DraftSaved> outcome = writer.saveDrafts(userId, attemptId, body);
        if (outcome.isEmpty()) {
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
                ? exam.maxScore() : attempt.getExam().getMaxScore();
        String title = exam != null && exam.title() != null ? exam.title() : attempt.getExam().getTitle();

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
                    explanation(live.get(display.questionId()))));
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
                questions);
    }

    // ---------------------------------------------------------------------------------
    // shared helpers
    // ---------------------------------------------------------------------------------

    /** Only an ACTIVE enrollment opens the door to a course's exams (spec 0.3 rule 1). */
    private void requireEnrollment(Exam exam, Long userId) {
        Long courseId = exam.getCourse() != null ? exam.getCourse().getCourseId()
                : exam.getModule() != null && exam.getModule().getCourse() != null
                ? exam.getModule().getCourse().getCourseId() : null;
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
                ? exam.maxScore() : attempt.getExam().getMaxScore();
        String title = exam != null && exam.title() != null ? exam.title() : attempt.getExam().getTitle();

        Map<Long, Question> live = liveQuestions(rows);
        BigDecimal totalWeight = AttemptScoring.totalWeight(weights(rows));

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
                            : new AttemptResponses.AnswerSpace(display.answerSpace().maxLength())));
            if (withAnswers) {
                drafts.add(new AttemptResponses.Answer(
                        display.questionId(), row.getDraftSeq(), paperFactory.readResponse(row.getResponse())));
            }
        }

        return new AttemptResponses.Session(
                attempt.getAttemptId(),
                attempt.getExam().getExamId(),
                title,
                attempt.getStatus(),
                attempt.getStartTime(),
                attempt.getDeadlineAt(),
                Instant.now(),
                maxScore,
                questions,
                drafts == null ? null : List.copyOf(drafts));
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
                question.getContent(), null, null, null);
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

    /** Explanations are cache only: SA-05 never calls the AI (spec 6.5). */
    private AttemptResponses.Explanation explanation(Question question) {
        if (question == null || question.getAiExplanation() == null || question.getAiExplanation().isBlank()) {
            return null;
        }
        String source = question.getAiExplanationSource() == null || question.getAiExplanationSource().isBlank()
                ? "MANAGER" : question.getAiExplanationSource();
        return new AttemptResponses.Explanation(question.getAiExplanation(), source);
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
