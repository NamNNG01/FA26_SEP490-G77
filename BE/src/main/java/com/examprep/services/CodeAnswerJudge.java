package com.examprep.services;

import com.examprep.dto.ResponseCode;
import com.examprep.dto.attempt.Snapshots;
import com.examprep.dto.student.CodeExamResponses;
import com.examprep.entities.AttemptAnswer;
import com.examprep.entities.CodeQuestionConfig;
import com.examprep.entities.CodeSubmission;
import com.examprep.entities.CodeTestCase;
import com.examprep.exceptions.BaseException;
import com.examprep.repositories.CodeQuestionConfigRepository;
import com.examprep.repositories.CodeSubmissionRepository;
import com.examprep.repositories.CodeTestCaseRepository;
import com.examprep.services.student.QuestionReviewRecorder;
import com.examprep.util.attempt.AttemptScoring;
import com.examprep.util.attempt.CodeSource;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.function.Function;
import java.util.stream.Collectors;

@Component
@RequiredArgsConstructor
@Slf4j
class CodeAnswerJudge {
    private static final int DEFAULT_TIME_LIMIT_MS = 5000;
    private static final int DEFAULT_MEMORY_KB = 262144;
    private static final int OUTPUT_CAP = 10_000;

    private final CodeQuestionConfigRepository configs;
    private final CodeTestCaseRepository fixtures;
    private final CodeSubmissionRepository submissions;
    private final QuestionReviewRecorder reviews;
    private final AttemptPaperFactory paperFactory;
    private final ObjectMapper json;
    private final PistonClient piston;
    private final ExecutorService pool = Executors.newCachedThreadPool(PistonClient.daemonThreads("code-submit-"));

    record Plan(Long questionId, String language, String source, List<PistonClient.CaseInput> cases,
                BigDecimal points, int timeLimitMs, int memoryLimitKb) {}

    record Verdict(List<PistonClient.CaseOutcome> outcomes, String error) {}

    Map<Long, CodeQuestionConfig> configs(Collection<Long> ids) {
        return ids.isEmpty() ? Map.of() : configs.findAllById(ids).stream()
                .collect(Collectors.toMap(CodeQuestionConfig::getQuestionId, Function.identity()));
    }

    Map<Long, List<CodeTestCase>> fixtures(Collection<Long> ids) {
        return ids.isEmpty() ? Map.of() : fixtures.findByQuestionIds(ids).stream()
                .collect(Collectors.groupingBy(fixture -> fixture.getQuestion().getQuestionId()));
    }

    String language(CodeQuestionConfig config) {
        if (config == null) {
            return PistonClient.JAVA;
        }
        JsonNode allowed = paperFactory.readResponse(config.getAllowedLanguages());
        if (allowed != null && allowed.isArray()) {
            for (JsonNode entry : allowed) {
                if (PistonClient.supports(entry.textValue())) {
                    return entry.textValue();
                }
            }
        }
        return PistonClient.JAVA;
    }

    String language(Long questionId) {
        return language(configs.findById(questionId).orElse(null));
    }

    Optional<String> draftLanguageError(Long questionId, JsonNode response) {
        if (response != null && response.has("language")
                && !language(questionId).equals(response.get("language").textValue())) {
            return Optional.of("This question does not allow the language " + response.get("language").asText());
        }
        return Optional.empty();
    }

    void requireLanguage(CodeQuestionConfig config, String language) {
        if (!PistonClient.supports(language)) {
            throw new BaseException(ResponseCode.UNSUPPORTED_LANGUAGE, "Language is not supported: " + language);
        }
        if (!language(config).equals(language)) {
            throw new BaseException(ResponseCode.UNSUPPORTED_LANGUAGE,
                    "This question does not allow the language " + language);
        }
    }

    int timeLimit(CodeQuestionConfig config) {
        return config == null || config.getTimeLimitMs() == null ? DEFAULT_TIME_LIMIT_MS : config.getTimeLimitMs();
    }

    int memoryLimit(CodeQuestionConfig config) {
        return config == null || config.getMemoryLimitKb() == null ? DEFAULT_MEMORY_KB : config.getMemoryLimitKb();
    }

    Plan plan(Long questionId, String language, String source, BigDecimal points,
              CodeQuestionConfig config, List<CodeTestCase> cases) {
        List<PistonClient.CaseInput> inputs = cases.stream()
                .map(test -> new PistonClient.CaseInput(test.getTestCaseId(), test.getInputData(), test.getExpectedOutput()))
                .toList();
        return new Plan(questionId, language, source, inputs, points, timeLimit(config), memoryLimit(config));
    }

    List<Plan> prepareDrafts(List<AttemptAnswer> rows, BigDecimal maxScore) {
        var drafts = rows.stream()
                .filter(row -> row.getGradedAt() == null || row.getScoreEarned() == null)
                .filter(this::isCode)
                .filter(row -> !source(row).isBlank())
                .toList();
        List<Long> ids = drafts.stream().map(row -> row.getQuestion().getQuestionId()).distinct().toList();
        Map<Long, CodeQuestionConfig> configsById = configs(ids);
        Map<Long, List<CodeTestCase>> fixturesById = fixtures(ids);
        BigDecimal totalWeight = AttemptScoring.totalWeight(rows.stream().map(AttemptAnswer::getWeightSnapshot).toList());
        return drafts.stream().map(row -> {
            Long id = row.getQuestion().getQuestionId();
            JsonNode response = paperFactory.readResponse(row.getResponse());
            CodeQuestionConfig config = configsById.get(id);
            String savedLanguage = response.path("language").textValue();
            String language = PistonClient.supports(savedLanguage) ? savedLanguage : language(config);
            BigDecimal points = AttemptScoring.output(AttemptScoring.questionMaxPoints(row.getWeightSnapshot(), totalWeight, maxScore));
            return plan(id, language, response.path("text").textValue(), points, config, fixturesById.getOrDefault(id, List.of()));
        }).toList();
    }

    boolean isCode(AttemptAnswer row) {
        Snapshots.DisplayQuestion display = paperFactory.read(row.getDisplaySnapshot(), Snapshots.DisplayQuestion.class);
        return "CODE".equals(paperFactory.questionType(row, display));
    }

    String source(AttemptAnswer row) {
        JsonNode response = paperFactory.readResponse(row.getResponse());
        return response != null && response.path("text").isTextual() ? response.path("text").textValue() : "";
    }

    Map<Long, Verdict> judge(List<Plan> plans, boolean recordFailure) {
        List<CompletableFuture<Verdict>> pending = plans.stream()
                .map(plan -> CompletableFuture.supplyAsync(() -> judge(plan, recordFailure), pool))
                .toList();
        Map<Long, Verdict> results = new java.util.LinkedHashMap<>();
        for (int i = 0; i < plans.size(); i++) {
            results.put(plans.get(i).questionId(), PistonClient.joinUnwrapped(pending.get(i)));
        }
        return results;
    }

    private Verdict judge(Plan plan, boolean recordFailure) {
        try {
            CodeSource.requireAllowedSize(plan.source());
            if (plan.cases().isEmpty()) {
                return new Verdict(List.of(), "CODE_NO_TEST_CASES");
            }
            return new Verdict(piston.judge(plan.language(), plan.source(), plan.cases(),
                    plan.timeLimitMs(), plan.memoryLimitKb()), null);
        } catch (BaseException ex) {
            if (!recordFailure) {
                throw ex;
            }
            log.warn("Judging saved code for question {} failed ({})", plan.questionId(), ex.getResponseCode());
            return new Verdict(List.of(), ex.getResponseCode() == ResponseCode.CODE_EXECUTION_UNAVAILABLE
                    ? "CODE_EXECUTION_UNAVAILABLE" : "CODE_SOURCE_REJECTED");
        }
    }

    CodeExamResponses.CaseResult persist(AttemptAnswer answer, Plan plan, Verdict verdict, Instant now) {
        List<PistonClient.CaseOutcome> outcomes = verdict.outcomes();
        int total = plan.cases().size();
        int passed = (int) outcomes.stream().filter(PistonClient.CaseOutcome::passed).count();
        boolean allPassed = verdict.error() == null && total > 0 && outcomes.size() == total && passed == total;
        String status = allPassed ? CodeSubmission.PASSED : CodeSubmission.FAILED;
        Integer firstFailure = null;
        for (int i = 0; i < outcomes.size(); i++) {
            if (!outcomes.get(i).passed()) {
                firstFailure = i + 1;
                break;
            }
        }
        var attempt = answer.getAttempt();
        String stderr = first(outcomes, PistonClient.CaseOutcome::stderr);
        String compile = first(outcomes, PistonClient.CaseOutcome::compileOutput);
        submissions.save(CodeSubmission.builder()
                .attemptAnswer(answer)
                .attempt(attempt)
                .question(answer.getQuestion())
                .user(attempt.getUser())
                .language(plan.language())
                .sourceCode(plan.source())
                .status(status)
                .stdout(first(outcomes, PistonClient.CaseOutcome::stdout))
                .stderr(stderr == null ? compile : stderr)
                .compileOutput(compile)
                .timeMs(outcomes.stream().map(PistonClient.CaseOutcome::timeMs)
                        .filter(java.util.Objects::nonNull).max(Integer::compare).orElse(null))
                .testResults(testResultsJson(outcomes))
                .passedCount(passed)
                .totalCount(total)
                .submittedAt(now)
                .judgedAt(now)
                .build());

        ObjectNode response = json.createObjectNode().put("text", plan.source()).put("language", plan.language());
        answer.setResponse(response.toString());
        answer.setScoreEarned(allPassed ? plan.points() : BigDecimal.ZERO.setScale(2));
        answer.setIsCorrect(allPassed);
        answer.setGradingStatus(verdict.error() == null ? "AUTO" : "FAILED");
        answer.setGradingError(verdict.error());
        answer.setGradedAt(now);
        if (verdict.error() == null) {
            reviews.record(attempt.getUser().getUserId(), answer.getQuestion(), allPassed, answer.getResponse());
        }
        return new CodeExamResponses.CaseResult(plan.questionId(), status, passed, total, firstFailure);
    }

    private String testResultsJson(List<PistonClient.CaseOutcome> outcomes) {
        ArrayNode array = json.createArrayNode();
        for (PistonClient.CaseOutcome outcome : outcomes) {
            ObjectNode row = array.addObject();
            row.put("testCaseId", outcome.testCaseId());
            row.put("passed", outcome.passed());
            row.put("stdout", truncate(outcome.stdout()));
        }
        return array.toString();
    }

    private static String first(List<PistonClient.CaseOutcome> outcomes, Function<PistonClient.CaseOutcome, String> getter) {
        return outcomes.stream().map(getter).filter(value -> value != null && !value.isBlank())
                .findFirst().map(CodeAnswerJudge::truncate).orElse(null);
    }

    private static String truncate(String value) {
        return value == null || value.length() <= OUTPUT_CAP ? value : value.substring(0, OUTPUT_CAP);
    }
}
