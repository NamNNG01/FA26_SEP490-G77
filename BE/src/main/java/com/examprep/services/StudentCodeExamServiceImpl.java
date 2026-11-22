package com.examprep.services;

import com.examprep.dto.PageResponse;
import com.examprep.dto.attempt.Snapshots;
import com.examprep.dto.student.CodeExamRequests;
import com.examprep.dto.student.CodeExamResponses;
import com.examprep.entities.AttemptAnswer;
import com.examprep.entities.CodeQuestionConfig;
import com.examprep.entities.CodeSubmission;
import com.examprep.entities.CodeTestCase;
import com.examprep.entities.Enrollment;
import com.examprep.entities.Exam;
import com.examprep.entities.ExamAttempt;
import com.examprep.entities.ExamQuestion;
import com.examprep.entities.Question;
import com.examprep.exceptions.BadRequestException;
import com.examprep.exceptions.ForbiddenException;
import com.examprep.exceptions.ResourceConflictException;
import com.examprep.exceptions.ResourceNotFoundException;
import com.examprep.repositories.AttemptAnswerRepository;
import com.examprep.repositories.CodeQuestionConfigRepository;
import com.examprep.repositories.CodeSubmissionRepository;
import com.examprep.repositories.CodeTestCaseRepository;
import com.examprep.repositories.EnrollmentRepository;
import com.examprep.repositories.ExamAttemptRepository;
import com.examprep.repositories.ExamQuestionRepository;
import com.examprep.repositories.ExamRepository;
import com.examprep.repositories.QuestionRepository;
import com.examprep.util.attempt.AttemptScoring;
import com.examprep.util.attempt.CodeSource;
import jakarta.persistence.EntityManager;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * CD-03 … CD-07 (spec 19): coding tests judged by a Piston v2-compatible sandbox (the hosted
 * OnlineCompiler.io endpoint by default).
 *
 * <p>Security rules from the spec: only the owner with an ACTIVE enrollment sees the exam's code
 * questions; hidden fixtures and answers never leave the server except as the sandbox's stdin;
 * judging uses Piston from the backend only; CD-05 writes the verdict into the running attempt so
 * SA-04/SA-05 count it (the shared grader keeps rows already finalized by CD-05).</p>
 */
@Service
@RequiredArgsConstructor
public class StudentCodeExamServiceImpl implements StudentCodeExamService {
    private static final int MAX_PAGE_SIZE = 100;
    private static final String TYPE_CODE = "CODE";
    private static final String STATUS_IN_PROGRESS = "IN_PROGRESS";

    private final ExamRepository exams;
    private final EnrollmentRepository enrollments;
    private final ExamQuestionRepository examLinks;
    private final QuestionRepository questions;
    private final CodeQuestionConfigRepository configs;
    private final CodeTestCaseRepository fixtures;
    private final ExamAttemptRepository attempts;
    private final AttemptAnswerRepository answers;
    private final CodeSubmissionRepository submissions;
    private final PistonClient piston;
    private final AttemptPaperFactory paperFactory;
    private final ObjectMapper json;
    private final AttemptAutoSubmitter autoSubmitter;
    private final PlatformTransactionManager transactionManager;
    private final CodeAnswerJudge judge;
    private final EntityManager entityManager;

    private record SubmitPlan(Long attemptId, UUID token, List<CodeAnswerJudge.Plan> answers) {}

    // ----------------------------------------------------------------------------------
    // CD-03
    // ----------------------------------------------------------------------------------

    @Override
    @Transactional(readOnly = true)
    public CodeExamResponses.Questions questions(Long userId, Long examId) {
        Exam exam = requireExam(userId, examId, true);
        // One link query feeds both the code-question list and its paper order.
        List<ExamQuestion> links = examLinks.findByExamExamIdOrderByOrderIndexAscExamQuestionIdAsc(examId);
        List<Long> codeQuestionIds = new ArrayList<>(links.stream()
                .filter(link -> TYPE_CODE.equals(link.getQuestion().getQuestionType()))
                .map(link -> link.getQuestion().getQuestionId())
                .toList());
        Set<Long> activeQuestionIds = new HashSet<>();
        attempts.findActiveAttempt(examId, userId, STATUS_IN_PROGRESS).ifPresent(attempt -> {
            for (AttemptAnswer answer : answers.findByAttemptIdOrdered(attempt.getAttemptId())) {
                Question question = answer.getQuestion();
                activeQuestionIds.add(question.getQuestionId());
                if (TYPE_CODE.equals(question.getQuestionType()) && !codeQuestionIds.contains(question.getQuestionId())) {
                    codeQuestionIds.add(question.getQuestionId());
                }
            }
        });
        Map<Long, Integer> orderById = links.stream()
                .collect(Collectors.toMap(link -> link.getQuestion().getQuestionId(),
                        ExamQuestion::getOrderIndex, (first, second) -> first));
        Map<Long, Question> questionById = codeQuestionIds.isEmpty() ? Map.of()
                : questions.findDeliverableWithAccessRelationsByQuestionIdIn(codeQuestionIds).stream()
                .collect(Collectors.toMap(Question::getQuestionId, question -> question, (first, second) -> first));
        Map<Long, CodeQuestionConfig> cfgById = judge.configs(codeQuestionIds);
        Map<Long, List<CodeTestCase>> fixturesByQuestion = judge.fixtures(codeQuestionIds);

        List<CodeExamResponses.QuestionItem> items = new ArrayList<>();
        for (Long questionId : codeQuestionIds) {
            Question question = questionById.get(questionId);
            if (question == null && activeQuestionIds.contains(questionId)) {
                question = questions.findActiveById(questionId).filter(StudentCodeExamServiceImpl::archivedAndApproved).orElse(null);
            }
            if (question == null) {
                continue;
            }
            CodeQuestionConfig cfg = cfgById.get(questionId);
            CodeTestCase sample = fixturesByQuestion.getOrDefault(questionId, List.of()).stream()
                    .filter(fixture -> !Boolean.TRUE.equals(fixture.getHidden()))
                    .findFirst()
                    .orElse(null);
            items.add(new CodeExamResponses.QuestionItem(
                    questionId,
                    orderById.getOrDefault(questionId, 0),
                    question.getContent(),
                    List.of(judge.language(cfg)),
                    cfg == null ? null : cfg.getCodeTemplate(),
                    sample == null ? null : sample.getInputData(),
                    sample == null ? null : sample.getExpectedOutput()));
        }
        return new CodeExamResponses.Questions(examId, exam.getTitle(), exam.getDurationMinutes(), items);
    }

    // ----------------------------------------------------------------------------------
    // CD-04
    // ----------------------------------------------------------------------------------

    @Override
    public CodeExamResponses.RunResult run(Long userId, CodeExamRequests.Run request) {
        CodeSource.requireAllowedSize(request.sourceCode());
        if (answers.findRunnableAttempts(request.questionId(), userId).stream()
                .noneMatch(attempt -> !autoSubmitter.isExpired(attempt, Instant.now()))) {
            throw new ResourceNotFoundException("Question not found");
        }
        Question question = questions.findDeliverableById(request.questionId())
                .orElseGet(() -> questions.findActiveById(request.questionId())
                        .filter(StudentCodeExamServiceImpl::archivedAndApproved)
                        .orElseThrow(() -> new ResourceNotFoundException("Question not found")));
        requireCodeQuestion(question);
        requireEnrollment(userId, courseIdOf(question));
        CodeQuestionConfig cfg = configs.findById(question.getQuestionId()).orElse(null);
        judge.requireLanguage(cfg, request.language());
        String stdin = request.stdin();
        if (stdin == null) {
            stdin = fixtures.findByQuestionQuestionIdAndHiddenOrderByOrderIndexAscTestCaseIdAsc(
                    question.getQuestionId(), false).stream()
                    .findFirst()
                    .map(CodeTestCase::getInputData)
                    .orElse("");
        }
        PistonClient.RunOutcome outcome = piston.run(request.language(), request.sourceCode(), stdin,
                judge.timeLimit(cfg), judge.memoryLimit(cfg));
        return new CodeExamResponses.RunResult(outcome.status(), outcome.stdout(), outcome.stderr(),
                outcome.executionTimeMs());
    }

    // ----------------------------------------------------------------------------------
    // CD-05
    // ----------------------------------------------------------------------------------

    @Override
    public CodeExamResponses.Submitted submit(Long userId, CodeExamRequests.Submit request) {
        request.answers().forEach(answer -> CodeSource.requireAllowedSize(answer.sourceCode()));
        TransactionTemplate tx = new TransactionTemplate(transactionManager);
        SubmitPlan plan = tx.execute(status -> prepareSubmit(userId, request));
        try {
            Map<Long, CodeAnswerJudge.Verdict> verdicts = judge.judge(plan.answers(), false);
            return tx.execute(status -> persistSubmit(plan, verdicts));
        } catch (RuntimeException ex) {
            try {
                tx.executeWithoutResult(status -> attempts.lockById(plan.attemptId()).ifPresent(attempt -> {
                    entityManager.refresh(attempt);
                    if (plan.token().equals(attempt.getCodeJudgingToken())) {
                        releaseJudging(attempt);
                    }
                }));
            } catch (RuntimeException cleanup) {
                ex.addSuppressed(cleanup);
            }
            throw ex;
        }
    }

    /** Validates the request against the running attempt and freezes what the judge needs. */
    private SubmitPlan prepareSubmit(Long userId, CodeExamRequests.Submit request) {
        Exam exam = requireExam(userId, request.examId(), true);
        Long attemptId = attempts.findActiveAttemptId(request.examId(), userId)
                .orElseThrow(() -> new ResourceConflictException("No attempt is in progress for this exam"));
        ExamAttempt attempt = lockRunning(attemptId);
        Instant now = Instant.now();
        if (autoSubmitter.isExpired(attempt, now)) {
            throw new ResourceConflictException("The attempt deadline has passed");
        }

        if (autoSubmitter.codeJudgingInProgress(attempt, now)) {
            throw new ResourceConflictException("Code judging is already in progress");
        }

        Map<Long, CodeExamRequests.Answer> requested = new LinkedHashMap<>();
        for (CodeExamRequests.Answer answer : request.answers()) {
            if (requested.putIfAbsent(answer.questionId(), answer) != null) {
                throw new BadRequestException("Duplicate questionId in answers");
            }
        }
        Set<Long> ids = requested.keySet();
        Map<Long, CodeQuestionConfig> cfgById = judge.configs(ids);
        Map<Long, List<CodeTestCase>> fixturesByQuestion = judge.fixtures(ids);
        List<AttemptAnswer> attemptRows = answers.findByAttemptIdOrdered(attempt.getAttemptId());
        Map<Long, AttemptAnswer> rowById = attemptRows.stream()
                .collect(Collectors.toMap(row -> row.getQuestion().getQuestionId(), row -> row,
                        (first, second) -> first));
        Set<Long> examQuestionIds = examLinks.findByExamExamIdOrderByOrderIndexAscExamQuestionIdAsc(request.examId()).stream()
                .map(link -> link.getQuestion().getQuestionId()).collect(Collectors.toSet());
        examQuestionIds.addAll(rowById.keySet());
        if (!examQuestionIds.containsAll(ids)) throw new ResourceNotFoundException("Question is not part of this exam");
        Map<Long, Question> questionById = questions.findActiveWithAccessRelationsByQuestionIdIn(ids).stream()
                .collect(Collectors.toMap(Question::getQuestionId, question -> question, (first, second) -> first));
        for (Long questionId : ids) {
            Question question = questionById.get(questionId);
            if (question == null || !"APPROVED".equals(question.getApprovalStatus())
                    || !("ACTIVE".equals(question.getStatus())
                    || ("ARCHIVED".equals(question.getStatus()) && rowById.containsKey(questionId)))) {
                throw new ResourceNotFoundException("Question not found");
            }
            requireCodeQuestion(question);
            judge.requireLanguage(cfgById.get(questionId), requested.get(questionId).language());
            if (fixturesByQuestion.getOrDefault(questionId, List.of()).isEmpty()) {
                throw new ResourceConflictException("Question has no test cases configured");
            }
        }

        if (!rowById.keySet().containsAll(ids)) {
            throw new ResourceConflictException("The attempt has no answer row for this question");
        }

        List<BigDecimal> weights = attemptRows.stream()
                .map(AttemptAnswer::getWeightSnapshot)
                .toList();
        BigDecimal totalWeight = AttemptScoring.totalWeight(weights);
        // Spec 0.3 rule 6: points come from the attempt's own frozen maxScore, not the live exam.
        Snapshots.ExamSnapshot frozen = paperFactory.read(attempt.getExamSnapshot(), Snapshots.ExamSnapshot.class);
        BigDecimal maxScore = frozen != null && frozen.maxScore() != null ? frozen.maxScore() : exam.getMaxScore();

        List<CodeAnswerJudge.Plan> planned = new ArrayList<>();
        for (CodeExamRequests.Answer answer : requested.values()) {
            Long questionId = answer.questionId();
            BigDecimal points = AttemptScoring.output(AttemptScoring.questionMaxPoints(
                    rowById.get(questionId).getWeightSnapshot(), totalWeight, maxScore));
            planned.add(judge.plan(questionId, answer.language(), answer.sourceCode(), points,
                    cfgById.get(questionId), fixturesByQuestion.get(questionId)));
        }
        UUID token = UUID.randomUUID();
        attempt.setCodeJudgingToken(token);
        // Recover if this process stops before the provider returns.
        attempt.setCodeJudgingUntil(Instant.now().plusSeconds(600));
        attempts.flush();
        return new SubmitPlan(attempt.getAttemptId(), token, planned);
    }

    private static boolean archivedAndApproved(Question question) {
        return "ARCHIVED".equals(question.getStatus()) && "APPROVED".equals(question.getApprovalStatus());
    }

    private ExamAttempt lockRunning(Long attemptId) {
        ExamAttempt attempt = attempts.lockById(attemptId)
                .orElseThrow(() -> new ResourceNotFoundException("Attempt not found"));
        entityManager.refresh(attempt);
        if (!STATUS_IN_PROGRESS.equals(attempt.getStatus())) {
            throw new ResourceConflictException("No attempt is in progress for this exam");
        }
        return attempt;
    }

    /** Writes the provider's verdict while the attempt is still running. */
    private CodeExamResponses.Submitted persistSubmit(SubmitPlan plan, Map<Long, CodeAnswerJudge.Verdict> verdicts) {
        ExamAttempt attempt = lockRunning(plan.attemptId());
        if (!plan.token().equals(attempt.getCodeJudgingToken())) {
            throw new ResourceConflictException("Code judging is no longer active for this submission");
        }
        Map<Long, AttemptAnswer> rowById = answers.findByAttemptIdOrdered(plan.attemptId()).stream()
                .collect(Collectors.toMap(row -> row.getQuestion().getQuestionId(), row -> row));
        Instant now = Instant.now();
        List<CodeExamResponses.CaseResult> results = new ArrayList<>();
        for (CodeAnswerJudge.Plan planned : plan.answers()) {
            AttemptAnswer row = rowById.get(planned.questionId());
            entityManager.refresh(row);
            results.add(judge.persist(row, planned, verdicts.get(planned.questionId()), now));
        }
        releaseJudging(attempt);
        return new CodeExamResponses.Submitted(results);
    }

    private void releaseJudging(ExamAttempt attempt) {
        attempt.setCodeJudgingToken(null);
        attempt.setCodeJudgingUntil(null);
    }

    // ----------------------------------------------------------------------------------
    // CD-06
    // ----------------------------------------------------------------------------------

    @Override
    public List<CodeExamResponses.Language> languages() {
        // Versions come from the engine's /runtimes (self-hosted Piston differs from the hosted one).
        Map<String, String> v = piston.runtimeVersions();
        if (v == null) {
            v = Map.of();
        }
        return List.of(
                new CodeExamResponses.Language(PistonClient.JAVA, "Java " + v.getOrDefault(PistonClient.JAVA, "25")),
                new CodeExamResponses.Language(PistonClient.PYTHON, "Python " + v.getOrDefault(PistonClient.PYTHON, "3.14")),
                new CodeExamResponses.Language(PistonClient.C, "C (gcc " + v.getOrDefault(PistonClient.C, "15") + ")"),
                new CodeExamResponses.Language(PistonClient.CPP, "C++ (g++ " + v.getOrDefault(PistonClient.CPP, "15") + ")"));
    }

    // ----------------------------------------------------------------------------------
    // CD-07
    // ----------------------------------------------------------------------------------

    @Override
    @Transactional(readOnly = true)
    public PageResponse<CodeExamResponses.SubmissionItem> submissions(Long userId, Long examId, Long attemptId, int page, int size) {
        requireExam(userId, examId);
        if (page < 0 || size < 1 || size > MAX_PAGE_SIZE) {
            throw new BadRequestException("page must be >= 0 and size must be between 1 and " + MAX_PAGE_SIZE);
        }
        Page<CodeSubmission> result = submissions.findHistory(userId, examId, attemptId, PageRequest.of(page, size));
        Map<Long, CodeTestCase> fixtureById = judge.fixtures(result.getContent().stream()
                        .map(row -> row.getQuestion().getQuestionId())
                        .collect(Collectors.toSet()))
                .values().stream()
                .flatMap(List::stream)
                .collect(Collectors.toMap(CodeTestCase::getTestCaseId, fixture -> fixture, (first, second) -> first));
        List<CodeExamResponses.SubmissionItem> items = result.getContent().stream()
                .map(row -> new CodeExamResponses.SubmissionItem(
                        row.getSubmissionId(),
                        row.getAttempt().getAttemptId(),
                        row.getQuestion().getQuestionId(),
                        row.getLanguage(),
                        row.getStatus(),
                        row.getPassedCount(),
                        row.getTotalCount(),
                        testCaseOutcomes(row, fixtureById),
                        row.getSubmittedAt()))
                .toList();
        return PageResponse.of(result, items);
    }

    // ----------------------------------------------------------------------------------
    // Helpers
    // ----------------------------------------------------------------------------------

    /** CD-03/CD-05/CD-07: the exam must be published to students and belong to their course. */
    private Exam requireExam(Long userId, Long examId) {
        return requireExam(userId, examId, false);
    }

    private Exam requireExam(Long userId, Long examId, boolean allowActiveAttempt) {
        Exam exam = exams.findById(examId)
                .orElseThrow(() -> new ResourceNotFoundException("Exam not found"));
        if (!exam.isVisibleToStudents() && !(allowActiveAttempt && "ARCHIVED".equals(exam.getStatus())
                && attempts.findActiveAttempt(examId, userId, STATUS_IN_PROGRESS).isPresent())) {
            throw new ResourceNotFoundException("Exam not found");
        }
        requireEnrollment(userId, courseIdOf(exam));
        return exam;
    }

    private void requireEnrollment(Long userId, Long courseId) {
        if (courseId == null
                || !enrollments.existsByCourse_CourseIdAndUser_UserIdAndStatus(courseId, userId,
                        Enrollment.STATUS_ACTIVE)) {
            throw new ForbiddenException("You are not enrolled in the course of this exam");
        }
    }

    private static Long courseIdOf(Exam exam) {
        if (exam.getCourse() != null) {
            return exam.getCourse().getCourseId();
        }
        if (exam.getModule() != null && exam.getModule().getCourse() != null) {
            return exam.getModule().getCourse().getCourseId();
        }
        return null;
    }

    private static Long courseIdOf(Question question) {
        if (question.getCourse() != null) {
            return question.getCourse().getCourseId();
        }
        if (question.getModule() != null && question.getModule().getCourse() != null) {
            return question.getModule().getCourse().getCourseId();
        }
        if (question.getGroup() != null && question.getGroup().getCourse() != null) {
            return question.getGroup().getCourse().getCourseId();
        }
        return null;
    }

    private static void requireCodeQuestion(Question question) {
        if (!TYPE_CODE.equals(question.getQuestionType())) {
            throw new BadRequestException("Question is not a coding question");
        }
    }

    /**
     * CD-07: replays the per-fixture verdicts stored at judging time, so a review can list each
     * case instead of only its count. A public fixture carries its input and what the program
     * printed; the expected output is withheld from a failed fixture so it can't be hard-coded.
     *
     * <p>A hidden fixture reports only {@code passed}/{@code failed}: its input, its expected
     * output and the program's stdout never leave the server. Stdout is withheld too because a
     * program that echoes its stdin would otherwise print the hidden input back into the history,
     * where the attempt can still be resubmitted.</p>
     */
    private List<CodeExamResponses.TestCaseOutcome> testCaseOutcomes(CodeSubmission row,
                                                                    Map<Long, CodeTestCase> fixtureById) {
        if (row.getTestResults() == null || row.getTestResults().isBlank()) {
            return List.of();
        }
        JsonNode stored;
        try {
            stored = json.readTree(row.getTestResults());
        } catch (Exception ex) {
            return List.of();
        }
        if (stored == null || !stored.isArray()) {
            return List.of();
        }
        List<CodeExamResponses.TestCaseOutcome> outcomes = new ArrayList<>(stored.size());
        for (JsonNode node : stored) {
            long storedId = node.path("testCaseId").asLong(-1);
            CodeTestCase fixture = storedId > 0 ? fixtureById.get(storedId) : null;
            boolean hidden = fixture == null || Boolean.TRUE.equals(fixture.getHidden());
            boolean passed = node.path("passed").asBoolean(false);
            JsonNode stdout = node.get("stdout");
            outcomes.add(new CodeExamResponses.TestCaseOutcome(
                    fixture != null ? storedId : null,
                    fixture != null ? fixture.getOrderIndex() : null,
                    hidden,
                    passed,
                    fixture == null || hidden ? null : fixture.getInputData(),
                    fixture == null || hidden || !passed ? null : fixture.getExpectedOutput(),
                    stdout == null || stdout.isNull() || hidden ? null : stdout.asText()));
        }
        return outcomes;
    }

}
