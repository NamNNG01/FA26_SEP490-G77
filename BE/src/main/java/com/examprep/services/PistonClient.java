package com.examprep.services;

import com.examprep.dto.ResponseCode;
import com.examprep.exceptions.BaseException;
import com.fasterxml.jackson.databind.JsonNode;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * CD-04/CD-05 execution adapter for a Piston v2-compatible API (spec 26.2 decision 2). The
 * default endpoint is the hosted OnlineCompiler.io service; {@code app.piston.base-url} can
 * point at any Piston v2 deployment instead.
 *
 * <p>The backend calls the provider, never the browser. Each fixture is one sandboxed run with
 * no network: the request carries the source, stdin and the question's run timeout, and the
 * backend compares stdout with the expected output (the provider never sees hidden answers
 * because they are not part of the request).</p>
 *
 * <p>While {@code app.piston.api-key} is blank every call fails fast with
 * {@code 503 CODE_EXECUTION_UNAVAILABLE} instead of pretending an execution happened.</p>
 */
@Slf4j
@Component
public class PistonClient {
    public static final String JAVA = "JAVA";
    public static final String PYTHON = "PYTHON";
    public static final String C = "C";
    public static final String CPP = "CPP";

    private static final String FAILED = "FAILED";
    private static final String COMPLETED = "COMPLETED";

    /** Piston language names; the API-facing ids come from CD-06. */
    private static final Map<String, String> LANGUAGE_NAMES = Map.of(
            JAVA, "java",
            PYTHON, "python",
            C, "c",
            CPP, "c++");

    /**
     * The hosted provider ignores the version and always runs its current one (PISTON_VERSION=*
     * works there). A self-hosted Piston would need the exact value from {@code /runtimes}.
     */
    private static final String VERSION = "*";

    private static final int COMPILE_TIMEOUT_MS = 10_000;
    /** The hosted provider caps a run at 30 seconds, so never ask for more. */
    private static final int MAX_RUN_TIMEOUT_MS = 30_000;
    private static final int MIN_RUN_TIMEOUT_MS = 1_000;

    private static final String STATUS_TIMEOUT = "TO";
    private static final String STATUS_OUTPUT_LIMIT = "OL";
    private static final String STATUS_INTERNAL_ERROR = "XX";
    private static final String SIGNAL_TIMEOUT = "SIGKILL";
    private static final String TIME_LIMIT_TEXT = "Execution hit the resource limit (time limit exceeded)";

    private static final Pattern JAVA_PUBLIC_TYPE = Pattern.compile(
            "\\bpublic\\s+(?:(?:final|abstract|sealed|non-sealed|strictfp)\\s+)*"
                    + "(?:class|interface|enum|record)\\s+([A-Za-z_$][\\w$]*)");

    private final RestClient client;
    private final String apiKey;

    public PistonClient(
            @Value("${app.piston.base-url:https://api.onlinecompiler.io/api/v2/piston}") String baseUrl,
            @Value("${app.piston.api-key:}") String apiKey) {
        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout((int) Duration.ofSeconds(10).toMillis());
        // One call runs one fixture; the provider's own ceiling is 30 seconds.
        requestFactory.setReadTimeout((int) Duration.ofSeconds(60).toMillis());
        String cleaned = baseUrl == null ? "" : baseUrl.trim();
        while (cleaned.endsWith("/")) {
            cleaned = cleaned.substring(0, cleaned.length() - 1);
        }
        this.client = RestClient.builder().baseUrl(cleaned).requestFactory(requestFactory).build();
        this.apiKey = apiKey == null ? "" : apiKey.trim();
    }

    /** CD-04/CD-05: {@code 503 CODE_EXECUTION_UNAVAILABLE} while no provider key is configured. */
    public void requireConfigured() {
        if (apiKey.isEmpty()) {
            throw new BaseException(ResponseCode.CODE_EXECUTION_UNAVAILABLE,
                    "Code execution is not configured; set PISTON_API_KEY to the hosted Piston API key");
        }
    }

    public static boolean supports(String language) {
        return language != null && LANGUAGE_NAMES.containsKey(language);
    }

    /** One fixture of a question while judging. */
    public record CaseInput(Long testCaseId, String input, String expectedOutput) {}

    /** Provider output for one fixture. */
    public record CaseOutcome(Long testCaseId, boolean passed, String stdout, String stderr,
                              String compileOutput, Integer timeMs) {}

    /** CD-04 result: {@code status} is COMPLETED or FAILED (spec 19.2). */
    public record RunOutcome(String status, String stdout, String stderr, Integer executionTimeMs) {}

    /** CD-04: runs the source against one public sample (no grading). */
    public RunOutcome run(String language, String sourceCode, String stdin, int timeLimitMs, int memoryLimitKb) {
        requireConfigured();
        JsonNode result = execute(language, sourceCode, stdin, timeLimitMs, memoryLimitKb);
        String compileText = compileFailure(result);
        JsonNode run = result.path("run");
        if (compileText != null) {
            return new RunOutcome(FAILED, null, compileText,
                    run.isObject() ? intOrNull(run, "wall_time") : null);
        }
        if (!run.isObject()) {
            throw unavailable("The code execution provider returned no run result");
        }
        return runOutcome(run);
    }

    /**
     * CD-05: judges every fixture of one submission. A Piston run executes one program, so each
     * fixture is a separate call; outcomes keep the order of {@code cases}. Only exit code 0 plus
     * an output match counts as passed, so timeouts, signals, compile errors and runtime errors
     * never pass even when stdout happens to match.
     */
    public List<CaseOutcome> judge(String language, String sourceCode, List<CaseInput> cases,
                                   int timeLimitMs, int memoryLimitKb) {
        requireConfigured();
        if (cases.isEmpty()) {
            return List.of();
        }
        List<CaseOutcome> outcomes = new ArrayList<>(cases.size());
        for (CaseInput testCase : cases) {
            JsonNode result = execute(language, sourceCode, testCase.input(), timeLimitMs, memoryLimitKb);
            outcomes.add(caseOutcome(testCase, result));
        }
        return outcomes;
    }

    private CaseOutcome caseOutcome(CaseInput testCase, JsonNode result) {
        String compileText = compileFailure(result);
        JsonNode run = result.path("run");
        Integer timeMs = run.isObject() ? intOrNull(run, "wall_time") : null;
        if (compileText != null) {
            return new CaseOutcome(testCase.testCaseId(), false, null, compileText, compileText, timeMs);
        }
        if (!run.isObject()) {
            throw unavailable("The code execution provider returned no run result");
        }
        String status = text(run, "status");
        String signal = text(run, "signal");
        String stdout = text(run, "stdout");
        String stderr = text(run, "stderr");
        if (STATUS_TIMEOUT.equals(status) || SIGNAL_TIMEOUT.equals(signal)) {
            return new CaseOutcome(testCase.testCaseId(), false, stdout, TIME_LIMIT_TEXT, null, timeMs);
        }
        if (STATUS_OUTPUT_LIMIT.equals(status)) {
            return new CaseOutcome(testCase.testCaseId(), false, stdout,
                    "Execution output limit exceeded", null, timeMs);
        }
        if (STATUS_INTERNAL_ERROR.equals(status)) {
            throw unavailable("The code execution provider could not run this submission");
        }
        if (signal != null) {
            return new CaseOutcome(testCase.testCaseId(), false, stdout,
                    stderr != null ? stderr : "Execution was stopped by signal " + signal, null, timeMs);
        }
        Integer code = intOrNull(run, "code");
        if (code == null) {
            throw unavailable("The code execution provider returned no exit code");
        }
        if (code != 0) {
            return new CaseOutcome(testCase.testCaseId(), false, stdout,
                    failureText(stderr, text(run, "message"), code), null, timeMs);
        }
        boolean passed = normalize(stdout).equals(normalize(testCase.expectedOutput()));
        return new CaseOutcome(testCase.testCaseId(), passed, stdout, stderr, null, timeMs);
    }

    private RunOutcome runOutcome(JsonNode run) {
        String status = text(run, "status");
        String signal = text(run, "signal");
        String stdout = text(run, "stdout");
        String stderr = text(run, "stderr");
        Integer timeMs = intOrNull(run, "wall_time");
        if (STATUS_TIMEOUT.equals(status) || SIGNAL_TIMEOUT.equals(signal)) {
            return new RunOutcome(FAILED, null, TIME_LIMIT_TEXT, timeMs);
        }
        if (STATUS_OUTPUT_LIMIT.equals(status)) {
            return new RunOutcome(FAILED, null, "Execution output limit exceeded", timeMs);
        }
        if (STATUS_INTERNAL_ERROR.equals(status)) {
            throw unavailable("The code execution provider could not run this submission");
        }
        if (signal != null) {
            return new RunOutcome(FAILED, null,
                    stderr != null ? stderr : "Execution was stopped by signal " + signal, timeMs);
        }
        Integer code = intOrNull(run, "code");
        if (code == null) {
            throw unavailable("The code execution provider returned no exit code");
        }
        if (code != 0) {
            return new RunOutcome(FAILED, null, failureText(stderr, text(run, "message"), code), timeMs);
        }
        return new RunOutcome(COMPLETED, stdout, stderr, timeMs);
    }

    /** Returns the compiler text when the provider reported a failed compile stage, else null. */
    private static String compileFailure(JsonNode result) {
        JsonNode compile = result.path("compile");
        if (!compile.isObject()) {
            return null;
        }
        Integer code = intOrNull(compile, "code");
        String signal = text(compile, "signal");
        if ((code == null || code == 0) && signal == null) {
            return null;
        }
        String text = firstNonBlank(text(compile, "stderr"), text(compile, "output"),
                text(compile, "stdout"));
        return text != null ? text : "Compilation failed";
    }

    private JsonNode execute(String language, String sourceCode, String stdin,
                             int timeLimitMs, int memoryLimitKb) {
        String providerLanguage = LANGUAGE_NAMES.get(language);
        if (providerLanguage == null) {
            throw new BaseException(ResponseCode.UNSUPPORTED_LANGUAGE, "Language is not supported: " + language);
        }
        requireConfigured();

        Map<String, Object> file = new LinkedHashMap<>();
        file.put("name", fileName(language, sourceCode));
        file.put("content", sourceCode == null ? "" : sourceCode);
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("language", providerLanguage);
        body.put("version", VERSION);
        body.put("files", List.of(file));
        body.put("stdin", stdin == null ? "" : stdin);
        body.put("run_timeout", Math.max(MIN_RUN_TIMEOUT_MS, Math.min(MAX_RUN_TIMEOUT_MS, timeLimitMs)));
        body.put("compile_timeout", COMPILE_TIMEOUT_MS);
        if (memoryLimitKb > 0) {
            // Piston expects bytes; the hosted provider ignores it and enforces 512 MB itself.
            body.put("run_memory_limit", (long) memoryLimitKb * 1024L);
        }

        var request = client.post().uri("/execute").contentType(MediaType.APPLICATION_JSON);
        if (!apiKey.isEmpty()) {
            request = request.header(HttpHeaders.AUTHORIZATION, apiKey);
        }
        try {
            JsonNode result = request.body(body).retrieve().body(JsonNode.class);
            if (result == null) {
                throw unavailable("The code execution provider returned an empty response");
            }
            return result;
        } catch (ResourceAccessException ex) {
            log.warn("Piston is unreachable: {}", ex.getMessage());
            throw unavailable("Code execution service is unreachable");
        } catch (RestClientResponseException ex) {
            log.warn("Piston rejected the submission: HTTP {}", ex.getStatusCode().value());
            throw unavailable("Code execution service could not run this submission");
        } catch (RuntimeException ex) {
            log.warn("Piston call failed: {}", ex.getMessage());
            throw unavailable("Code execution service could not run this submission");
        }
    }

    /** Java needs a file whose name matches its public type; other languages get a plain name. */
    private static String fileName(String language, String sourceCode) {
        if (PYTHON.equals(language)) {
            return "main.py";
        }
        if (C.equals(language)) {
            return "main.c";
        }
        if (CPP.equals(language)) {
            return "main.cpp";
        }
        Matcher matcher = JAVA_PUBLIC_TYPE.matcher(sourceCode == null ? "" : sourceCode);
        return matcher.find() ? matcher.group(1) + ".java" : "Main.java";
    }

    private static String failureText(String stderr, String message, int code) {
        String text = firstNonBlank(stderr, message);
        return text != null ? text : "Execution failed with exit code " + code;
    }

    private static String firstNonBlank(String... values) {
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value;
            }
        }
        return null;
    }

    private static String text(JsonNode node, String field) {
        JsonNode value = node.get(field);
        if (value == null || value.isNull()) {
            return null;
        }
        String text = value.asText();
        return text.isEmpty() ? null : text;
    }

    private static Integer intOrNull(JsonNode node, String field) {
        JsonNode value = node.get(field);
        return value != null && value.isNumber() ? value.asInt() : null;
    }

    private static BaseException unavailable(String message) {
        return new BaseException(ResponseCode.CODE_EXECUTION_UNAVAILABLE, message);
    }

    /** Piston compares with trailing whitespace ignored; do the same when scoring locally. */
    private static String normalize(String value) {
        if (value == null) {
            return "";
        }
        return value.replace("\r\n", "\n").stripTrailing();
    }
}
