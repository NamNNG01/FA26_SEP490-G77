package com.examprep.services;

import com.examprep.dto.PageResponse;
import com.examprep.dto.ResponseCode;
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
import com.examprep.entities.User;
import com.examprep.exceptions.BadRequestException;
import com.examprep.exceptions.BaseException;
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
import com.examprep.repositories.UserRepository;
import com.examprep.util.attempt.AttemptScoring;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
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
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * CD-03 … CD-07 (spec 19): coding tests judged by the self-hosted Judge0 sandbox.
 *
 * <p>Security rules from the spec: only the owner with an ACTIVE enrollment sees the exam's code
 * questions; hidden fixtures and answers never leave the server; judging uses Judge0 from the
 * backend only; CD-05 writes the verdict into the running attempt so SA-04/SA-05 count it (the
 * shared grader keeps rows already finalized by CD-05).</p>
 */
@Service
@RequiredArgsConstructor
public class StudentCodeExamServiceImpl implements StudentCodeExamService {
    private static final int MAX_PAGE_SIZE = 100;
    private static final int DEFAULT_TIME_LIMIT_MS = 5000;
    private static final int DEFAULT_MEMORY_KB = 262144;
    private static final int OUTPUT_CAP = 10_000;
    private static final String TYPE_CODE = "CODE";
    private static final String STATUS_IN_PROGRESS = "IN_PROGRESS";
    private static final String GRADING_AUTO = "AUTO";

    private final ExamRepository exams;
    private final EnrollmentRepository enrollments;
    private final ExamQuestionRepository examLinks;
    private final QuestionRepository questions;
    private final CodeQuestionConfigRepository configs;
    private final CodeTestCaseRepository fixtures;
    private final ExamAttemptRepository attempts;
    private final AttemptAnswerRepository answers;
    private final CodeSubmissionRepository submissions;
    private final UserRepository users;
    private final Judge0Client judge0;
    private final AttemptPaperFactory paperFactory;
    private final ObjectMapper json;
    private final AttemptAutoSubmitter autoSubmitter;
    private final PlatformTransactionManager transactionManager;

    private record PlannedAnswer(Long questionId, String language, String sourceCode,
                                 List<Judge0Client.CaseInput> cases, BigDecimal maxPoints,
                                 int timeLimitMs, int memoryLimitKb) {}

    private record SubmitPlan(Long userId, Long attemptId, List<PlannedAnswer> answers) {}

    // ----------------------------------------------------------------------------------
    // CD-03
    // ----------------------------------------------------------------------------------

    @Override
    @Transactional(readOnly = true)
    public CodeExamResponses.Questions questions(Long userId, Long examId) {
        Exam exam = requireExam(userId, examId);
        // One link query feeds both the code-question list and its paper order.
        List<ExamQuestion> links = examLinks.findByExamExamIdOrderByOrderIndexAscExamQuestionIdAsc(examId);
        List<Long> codeQuestionIds = links.stream()
                .filter(link -> TYPE_CODE.equals(link.getQuestion().getQuestionType()))
                .map(link -> link.getQuestion().getQuestionId())
                .toList();
        Map<Long, Integer> orderById = links.stream()
                .collect(Collectors.toMap(link -> link.getQuestion().getQuestionId(),
                        ExamQuestion::getOrderIndex, (first, second) -> first));
        Map<Long, Question> questionById = codeQuestionIds.isEmpty() ? Map.of()
                : questions.findActiveWithAccessRelationsByQuestionIdIn(codeQuestionIds).stream()
                .collect(Collectors.toMap(Question::getQuestionId, question -> question, (first, second) -> first));
        Map<Long, CodeQuestionConfig> cfgById = configMap(codeQuestionIds);
        Map<Long, List<CodeTestCase>> fixturesByQuestion = fixtureMap(codeQuestionIds);

        List<CodeExamResponses.QuestionItem> items = new ArrayList<>();
        for (Long questionId : codeQuestionIds) {
            Question question = questionById.get(questionId);
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
                    allowedLanguages(cfg),
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
        Question question = questions.findActiveById(request.questionId())
                .orElseThrow(() -> new ResourceNotFoundException("Question not found"));
        requireCodeQuestion(question);
        requireEnrollment(userId, courseIdOf(question));
        CodeQuestionConfig cfg = configs.findById(question.getQuestionId()).orElse(null);
        requireLanguageAllowed(cfg, request.language());
        String stdin = request.stdin();
        if (stdin == null) {
            stdin = fixtures.findByQuestionQuestionIdAndHiddenOrderByOrderIndexAscTestCaseIdAsc(
                    question.getQuestionId(), false).stream()
                    .findFirst()
                    .map(CodeTestCase::getInputData)
                    .orElse("");
        }
        Judge0Client.RunOutcome outcome = judge0.run(request.language(), request.sourceCode(), stdin,
                timeLimit(cfg), memoryLimit(cfg));
        return new CodeExamResponses.RunResult(outcome.status(), outcome.stdout(), outcome.stderr(),
                outcome.executionTimeMs());
    }

    // ----------------------------------------------------------------------------------
    // CD-05
    // ----------------------------------------------------------------------------------

    @Override
    public CodeExamResponses.Submitted submit(Long userId, CodeExamRequests.Submit request) {
        // Spec 0.3 rule 4: Judge0 is an external call, so it never runs inside a DB transaction.
        TransactionTemplate read = new TransactionTemplate(transactionManager);
        read.setReadOnly(true);
        SubmitPlan plan = read.execute(status -> prepareSubmit(userId, request));
        if (plan == null) {
            throw new IllegalStateException("Coding submission could not be prepared");
        }
        Map<Long, List<Judge0Client.CaseOutcome>> outcomes = new LinkedHashMap<>();
        for (PlannedAnswer answer : plan.answers()) {
            outcomes.put(answer.questionId(), judge0.judge(answer.language(), answer.sourceCode(), answer.cases(),
                    answer.timeLimitMs(), answer.memoryLimitKb()));
        }
        return new TransactionTemplate(transactionManager).execute(status -> persistSubmit(plan, outcomes));
    }

    /** Validates the request against the running attempt and freezes what the judge needs. */
    private SubmitPlan prepareSubmit(Long userId, CodeExamRequests.Submit request) {
        Exam exam = requireExam(userId, request.examId());
        ExamAttempt attempt = attempts.findActiveAttempt(request.examId(), userId, STATUS_IN_PROGRESS)
                .orElseThrow(() -> new ResourceConflictException("No attempt is in progress for this exam"));
        if (autoSubmitter.isExpired(attempt, Instant.now())) {
            throw new ResourceConflictException("The attempt deadline has passed");
        }

        Map<Long, CodeExamRequests.Answer> requested = new LinkedHashMap<>();
        for (CodeExamRequests.Answer answer : request.answers()) {
            if (requested.putIfAbsent(answer.questionId(), answer) != null) {
                throw new BadRequestException("Duplicate questionId in answers");
            }
        }
        Set<Long> examQuestionIds = examLinks
                .findByExamExamIdOrderByOrderIndexAscExamQuestionIdAsc(request.examId()).stream()
                .map(link -> link.getQuestion().getQuestionId())
                .collect(Collectors.toSet());
        for (Long questionId : requested.keySet()) {
            if (!examQuestionIds.contains(questionId)) {
                throw new ResourceNotFoundException("Question is not part of this exam");
            }
        }

        Set<Long> ids = requested.keySet();
        Map<Long, CodeQuestionConfig> cfgById = configMap(ids);
        Map<Long, List<CodeTestCase>> fixturesByQuestion = fixtureMap(ids);
        Map<Long, Question> questionById = questions.findActiveWithAccessRelationsByQuestionIdIn(ids).stream()
                .collect(Collectors.toMap(Question::getQuestionId, question -> question, (first, second) -> first));
        for (Long questionId : ids) {
            Question question = questionById.get(questionId);
            if (question == null) {
                throw new ResourceNotFoundException("Question not found");
            }
            requireCodeQuestion(question);
            requireLanguageAllowed(cfgById.get(questionId), requested.get(questionId).language());
            if (fixturesByQuestion.getOrDefault(questionId, List.of()).isEmpty()) {
                throw new ResourceConflictException("Question has no test cases configured");
            }
        }

        List<AttemptAnswer> attemptRows = answers.findByAttemptIdOrdered(attempt.getAttemptId());
        Map<Long, AttemptAnswer> rowById = attemptRows.stream()
                .collect(Collectors.toMap(row -> row.getQuestion().getQuestionId(), row -> row,
                        (first, second) -> first));
        for (Long questionId : ids) {
            if (!rowById.containsKey(questionId)) {
                throw new ResourceConflictException("The attempt has no answer row for this question");
            }
        }

        List<BigDecimal> weights = attemptRows.stream()
                .map(AttemptAnswer::getWeightSnapshot)
                .toList();
        BigDecimal totalWeight = AttemptScoring.totalWeight(weights);
        // Spec 0.3 rule 6: points come from the attempt's own frozen maxScore, not the live exam.
        Snapshots.ExamSnapshot frozen = paperFactory.read(attempt.getExamSnapshot(), Snapshots.ExamSnapshot.class);
        BigDecimal maxScore = frozen != null && frozen.maxScore() != null ? frozen.maxScore() : exam.getMaxScore();

        List<PlannedAnswer> planned = new ArrayList<>();
        for (CodeExamRequests.Answer answer : requested.values()) {
            Long questionId = answer.questionId();
            CodeQuestionConfig cfg = cfgById.get(questionId);
            AttemptAnswer row = rowById.get(questionId);
            List<Judge0Client.CaseInput> inputs = fixturesByQuestion.get(questionId).stream()
                    .map(fixture -> new Judge0Client.CaseInput(fixture.getTestCaseId(),
                            fixture.getInputData(), fixture.getExpectedOutput()))
                    .toList();
            BigDecimal maxPoints = AttemptScoring.output(AttemptScoring.questionMaxPoints(
                    row.getWeightSnapshot(), totalWeight, maxScore));
            planned.add(new PlannedAnswer(questionId, answer.language(), answer.sourceCode(), inputs, maxPoints,
                    timeLimit(cfg), memoryLimit(cfg)));
        }
        return new SubmitPlan(userId, attempt.getAttemptId(), planned);
    }

    /** Writes the verified verdicts while the attempt is still running; the attempt row stays locked. */
    private CodeExamResponses.Submitted persistSubmit(SubmitPlan plan,
                                                      Map<Long, List<Judge0Client.CaseOutcome>> judged) {
        ExamAttempt attempt = attempts.lockById(plan.attemptId())
                .orElseThrow(() -> new ResourceNotFoundException("Attempt not found"));
        if (!STATUS_IN_PROGRESS.equals(attempt.getStatus())) {
            throw new ResourceConflictException("No attempt is in progress for this exam");
        }
        Instant now = Instant.now();
        if (autoSubmitter.isExpired(attempt, now)) {
            throw new ResourceConflictException("The attempt deadline has passed");
        }
        User student = users.findById(plan.userId())
                .orElseThrow(() -> new ResourceNotFoundException("User not found"));
        Map<Long, AttemptAnswer> rowById = answers.findByAttemptIdOrdered(plan.attemptId()).stream()
                .collect(Collectors.toMap(row -> row.getQuestion().getQuestionId(), row -> row,
                        (first, second) -> first));

        List<CodeExamResponses.CaseResult> results = new ArrayList<>();
        for (PlannedAnswer planned : plan.answers()) {
            AttemptAnswer row = rowById.get(planned.questionId());
            if (row == null) {
                throw new ResourceConflictException("The attempt has no answer row for this question");
            }
            List<Judge0Client.CaseOutcome> outcomes =
                    judged.getOrDefault(planned.questionId(), List.of());
            int total = planned.cases().size();
            int passedCount = (int) outcomes.stream().filter(Judge0Client.CaseOutcome::passed).count();
            boolean allPassed = passedCount == total;
            Integer failedIndex = null;
            if (!allPassed) {
                for (int i = 0; i < outcomes.size(); i++) {
                    if (!outcomes.get(i).passed()) {
                        failedIndex = i + 1;
                        break;
                    }
                }
            }

            submissions.save(CodeSubmission.builder()
                    .attemptAnswer(row)
                    .attempt(attempt)
                    .question(row.getQuestion())
                    .user(student)
                    .language(planned.language())
                    .sourceCode(planned.sourceCode())
                    .status(allPassed ? CodeSubmission.PASSED : CodeSubmission.FAILED)
                    .stdout(first(outcomes, Judge0Client.CaseOutcome::stdout))
                    .stderr(firstNonEmpty(outcomes, outcome -> outcome.stderr(), outcome -> outcome.compileOutput()))
                    .compileOutput(first(outcomes, Judge0Client.CaseOutcome::compileOutput))
                    .timeMs(maxTime(outcomes))
                    .testResults(testResultsJson(outcomes))
                    .passedCount(passedCount)
                    .totalCount(total)
                    .submittedAt(now)
                    .judgedAt(now)
                    .build());

            // Score of this question inside the running attempt (spec 19.3): all-or-nothing.
            ObjectNode response = json.createObjectNode();
            response.put("text", planned.sourceCode());
            row.setResponse(response.toString());
            row.setScoreEarned(allPassed ? planned.maxPoints() : BigDecimal.ZERO.setScale(2));
            row.setIsCorrect(allPassed);
            row.setGradingStatus(GRADING_AUTO);
            row.setGradedAt(now);
            row.setGradingError(null);
            answers.save(row);

            results.add(new CodeExamResponses.CaseResult(planned.questionId(),
                    allPassed ? CodeSubmission.PASSED : CodeSubmission.FAILED,
                    passedCount, total, allPassed ? null : failedIndex));
        }
        return new CodeExamResponses.Submitted(results);
    }

    // ----------------------------------------------------------------------------------
    // CD-06
    // ----------------------------------------------------------------------------------

    @Override
    public List<CodeExamResponses.Language> languages() {
        return List.of(
                new CodeExamResponses.Language(Judge0Client.JAVA, "Java 17"),
                new CodeExamResponses.Language(Judge0Client.PYTHON, "Python 3.11"),
                new CodeExamResponses.Language(Judge0Client.C, "C (gcc 13)"),
                new CodeExamResponses.Language(Judge0Client.CPP, "C++ 17"));
    }

    // ----------------------------------------------------------------------------------
    // CD-07
    // ----------------------------------------------------------------------------------

    @Override
    @Transactional(readOnly = true)
    public PageResponse<CodeExamResponses.SubmissionItem> submissions(Long userId, Long examId, int page, int size) {
        requireExam(userId, examId);
        if (page < 0 || size < 1 || size > MAX_PAGE_SIZE) {
            throw new BadRequestException("page must be >= 0 and size must be between 1 and " + MAX_PAGE_SIZE);
        }
        Page<CodeSubmission> result = submissions.findHistory(userId, examId, PageRequest.of(page, size));
        List<CodeExamResponses.SubmissionItem> items = result.getContent().stream()
                .map(row -> new CodeExamResponses.SubmissionItem(
                        row.getSubmissionId(),
                        row.getQuestion().getQuestionId(),
                        row.getLanguage(),
                        row.getStatus(),
                        row.getPassedCount(),
                        row.getTotalCount(),
                        row.getSubmittedAt()))
                .toList();
        return PageResponse.of(result, items);
    }

    // ----------------------------------------------------------------------------------
    // Helpers
    // ----------------------------------------------------------------------------------

    /** CD-03/CD-05/CD-07: the exam must belong to a course the student is enrolled in. */
    private Exam requireExam(Long userId, Long examId) {
        Exam exam = exams.findById(examId)
                .orElseThrow(() -> new ResourceNotFoundException("Exam not found"));
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

    private Map<Long, CodeQuestionConfig> configMap(Collection<Long> ids) {
        return ids.isEmpty() ? Map.of()
                : configs.findAllById(ids).stream()
                .collect(Collectors.toMap(CodeQuestionConfig::getQuestionId, cfg -> cfg, (first, second) -> first));
    }

    private Map<Long, List<CodeTestCase>> fixtureMap(Collection<Long> ids) {
        return ids.isEmpty() ? Map.of()
                : fixtures.findByQuestionIds(ids).stream()
                .collect(Collectors.groupingBy(fixture -> fixture.getQuestion().getQuestionId()));
    }

    private void requireLanguageAllowed(CodeQuestionConfig cfg, String language) {
        if (!Judge0Client.supports(language)) {
            throw new BaseException(ResponseCode.UNSUPPORTED_LANGUAGE, "Language is not supported: " + language);
        }
        if (!allowedLanguages(cfg).contains(language)) {
            throw new BaseException(ResponseCode.UNSUPPORTED_LANGUAGE,
                    "This question does not allow the language " + language);
        }
    }

    private List<String> allowedLanguages(CodeQuestionConfig cfg) {
        if (cfg == null || cfg.getAllowedLanguages() == null || cfg.getAllowedLanguages().isBlank()) {
            return List.of(Judge0Client.JAVA, Judge0Client.PYTHON, Judge0Client.C, Judge0Client.CPP);
        }
        try {
            List<String> parsed = json.readerForListOf(String.class).readValue(cfg.getAllowedLanguages());
            return parsed == null || parsed.isEmpty()
                    ? List.of(Judge0Client.JAVA, Judge0Client.PYTHON, Judge0Client.C, Judge0Client.CPP)
                    : parsed;
        } catch (Exception ex) {
            throw new IllegalStateException("Question code configuration is invalid", ex);
        }
    }

    private static int timeLimit(CodeQuestionConfig cfg) {
        return cfg == null || cfg.getTimeLimitMs() == null ? DEFAULT_TIME_LIMIT_MS : cfg.getTimeLimitMs();
    }

    private static int memoryLimit(CodeQuestionConfig cfg) {
        return cfg == null || cfg.getMemoryLimitKb() == null ? DEFAULT_MEMORY_KB : cfg.getMemoryLimitKb();
    }

    private String testResultsJson(List<Judge0Client.CaseOutcome> outcomes) {
        ArrayNode array = json.createArrayNode();
        for (Judge0Client.CaseOutcome outcome : outcomes) {
            ObjectNode row = array.addObject();
            row.put("testCaseId", outcome.testCaseId() == null ? -1 : outcome.testCaseId().intValue());
            row.put("passed", outcome.passed());
        }
        return array.toString();
    }

    private static String first(List<Judge0Client.CaseOutcome> outcomes,
                                java.util.function.Function<Judge0Client.CaseOutcome, String> getter) {
        for (Judge0Client.CaseOutcome outcome : outcomes) {
            String value = getter.apply(outcome);
            if (value != null && !value.isBlank()) {
                return truncate(value);
            }
        }
        return null;
    }

    private static String firstNonEmpty(List<Judge0Client.CaseOutcome> outcomes,
                                        java.util.function.Function<Judge0Client.CaseOutcome, String> firstGetter,
                                        java.util.function.Function<Judge0Client.CaseOutcome, String> secondGetter) {
        String value = first(outcomes, firstGetter);
        return value != null ? value : first(outcomes, secondGetter);
    }

    private static Integer maxTime(List<Judge0Client.CaseOutcome> outcomes) {
        Integer max = null;
        for (Judge0Client.CaseOutcome outcome : outcomes) {
            if (outcome.timeMs() != null && (max == null || outcome.timeMs() > max)) {
                max = outcome.timeMs();
            }
        }
        return max;
    }

    private static String truncate(String value) {
        return value.length() <= OUTPUT_CAP ? value : value.substring(0, OUTPUT_CAP);
    }
}
