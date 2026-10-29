package com.examprep.services;

import com.examprep.dto.ResponseCode;
import com.examprep.exceptions.BaseException;
import com.fasterxml.jackson.databind.JsonNode;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.Map;

/**
 * CD-04/CD-05 execution adapter for the self-hosted Judge0 sandbox (spec 26.2 decision 2).
 *
 * <p>The backend calls Judge0, never the browser. Every submission carries the CPU time limit and
 * the memory limit of the question configuration, and source/stdin/output travel base64-encoded.
 * Judge0 itself runs each submission in an isolated container with no network.</p>
 *
 * <p>When {@code app.judge0.enabled=false} (the default for local development) every call fails
 * fast with {@code 503 CODE_EXECUTION_UNAVAILABLE} instead of pretending an execution happened.</p>
 */
@Slf4j
@Component
public class Judge0Client {
    public static final String JAVA = "JAVA";
    public static final String PYTHON = "PYTHON";
    public static final String C = "C";
    public static final String CPP = "CPP";

    /** Judge0 language ids of the self-hosted image; the names come from CD-06. */
    private static final Map<String, Integer> LANGUAGE_IDS = Map.of(
            JAVA, 62,
            PYTHON, 71,
            C, 50,
            CPP, 76);

    /** Judge0 status ids: 1 In Queue, 2 Processing, 3 Accepted, 4 Wrong Answer, 5 Time Limit,
     * 6 Compilation Error, 7–12 Runtime Error variants, 13 Internal Error, 14 Exec Format Error. */
    private static final int STATUS_TIME_LIMIT = 5;
    private static final int STATUS_COMPILATION_ERROR = 6;
    private static final int STATUS_INTERNAL_ERROR = 13;

    private final RestClient client;
    private final String authToken;
    private final boolean enabled;

    public Judge0Client(@Value("${app.judge0.base-url:http://localhost:2358}") String baseUrl,
                        @Value("${app.judge0.auth-token:}") String authToken,
                        @Value("${app.judge0.enabled:false}") boolean enabled) {
        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout((int) Duration.ofSeconds(10).toMillis());
        // One judge round may take several test cases x the per-case time limit.
        requestFactory.setReadTimeout((int) Duration.ofSeconds(120).toMillis());
        String cleaned = baseUrl == null ? "" : baseUrl.trim();
        if (cleaned.endsWith("/")) {
            cleaned = cleaned.substring(0, cleaned.length() - 1);
        }
        this.client = RestClient.builder().baseUrl(cleaned).requestFactory(requestFactory).build();
        this.authToken = authToken == null ? "" : authToken.trim();
        this.enabled = enabled;
    }

    /** CD-04/CD-05: {@code 503 CODE_EXECUTION_UNAVAILABLE} while Judge0 is not configured. */
    public void requireEnabled() {
        if (!enabled) {
            throw new BaseException(ResponseCode.CODE_EXECUTION_UNAVAILABLE,
                    "Code execution is not enabled; set JUDGE0_ENABLED=true and JUDGE0_BASE_URL to the self-hosted Judge0 service");
        }
    }

    public static boolean supports(String language) {
        return language != null && LANGUAGE_IDS.containsKey(language);
    }

    /** One fixture of a question while judging. */
    public record CaseInput(Long testCaseId, String input, String expectedOutput) {}

    /** Judge output for one fixture. */
    public record CaseOutcome(Long testCaseId, boolean passed, String stdout, String stderr,
                              String compileOutput, Integer timeMs) {}

    /** CD-04 result: {@code status} is COMPLETED or FAILED (spec 19.2). */
    public record RunOutcome(String status, String stdout, String stderr, Integer executionTimeMs) {}

    /** CD-04: runs the source against one public sample (no grading). */
    public RunOutcome run(String language, String sourceCode, String stdin, int timeLimitMs, int memoryLimitKb) {
        requireEnabled();
        JsonNode result = post("/submissions?base64_encoded=true&wait=true",
                submission(language, sourceCode, stdin == null ? "" : stdin, null, timeLimitMs, memoryLimitKb));
        int statusId = result.path("status").path("id").asInt(-1);
        if (statusId == STATUS_INTERNAL_ERROR) {
            throw new BaseException(ResponseCode.CODE_EXECUTION_UNAVAILABLE, "Judge0 could not run this submission");
        }
        if (statusId == 1 || statusId == 2) {
            throw new BaseException(ResponseCode.CODE_EXECUTION_UNAVAILABLE, "Judge0 did not finish this submission");
        }
        if (statusId == STATUS_COMPILATION_ERROR) {
            // Compilation error: FAILED with the compiler output as stderr (spec 19.2).
            return new RunOutcome("FAILED", null, decode(result.path("compile_output")), null);
        }
        if (statusId == STATUS_TIME_LIMIT) {
            return new RunOutcome("FAILED", null,
                    "Execution hit the resource limit (time limit exceeded)", null);
        }
        if (statusId > STATUS_COMPILATION_ERROR) {
            // Runtime error variants (7–12) and exec format error (14).
            return new RunOutcome("FAILED", null, decode(result.path("stderr")), null);
        }
        if (statusId != 3 && statusId != 4) {
            throw new BaseException(ResponseCode.CODE_EXECUTION_UNAVAILABLE,
                    "Judge0 returned an unexpected status");
        }
        Integer timeMs = result.path("time").isNumber() ? (int) Math.round(result.path("time").asDouble() * 1000) : null;
        return new RunOutcome("COMPLETED", decode(result.path("stdout")), decode(result.path("stderr")), timeMs);
    }

    /**
     * CD-05: judges every fixture of one submission in a single Judge0 batch call.
     * Judge0's batch endpoint ignores {@code wait}, so the created tokens are polled until every
     * fixture has a final status. The result order matches the order of {@code cases}.
     */
    public List<CaseOutcome> judge(String language, String sourceCode, List<CaseInput> cases,
                                   int timeLimitMs, int memoryLimitKb) {
        requireEnabled();
        if (cases.isEmpty()) {
            return List.of();
        }
        List<Map<String, Object>> submissions = new ArrayList<>();
        for (CaseInput testCase : cases) {
            submissions.add(submission(language, sourceCode,
                    testCase.input() == null ? "" : testCase.input(),
                    testCase.expectedOutput() == null ? "" : testCase.expectedOutput(),
                    timeLimitMs, memoryLimitKb));
        }
        JsonNode created = post("/submissions/batch?base64_encoded=true", Map.of("submissions", submissions));
        List<String> tokens = new ArrayList<>(cases.size());
        for (int i = 0; i < cases.size(); i++) {
            String token = created.path("submissions").path(i).path("token").asText("");
            if (token.isBlank()) {
                throw new BaseException(ResponseCode.CODE_EXECUTION_UNAVAILABLE,
                        "Judge0 did not accept the submission batch");
            }
            tokens.add(token);
        }
        JsonNode rows = awaitBatch(tokens, cases.size(), timeLimitMs).path("submissions");
        List<CaseOutcome> outcomes = new ArrayList<>(cases.size());
        for (int i = 0; i < cases.size(); i++) {
            CaseInput testCase = cases.get(i);
            JsonNode row = rows.path(i);
            int statusId = row.path("status").path("id").asInt(-1);
            if (statusId == STATUS_INTERNAL_ERROR) {
                throw new BaseException(ResponseCode.CODE_EXECUTION_UNAVAILABLE, "Judge0 could not run this submission");
            }
            if (statusId < 3 || statusId > 14) {
                throw new BaseException(ResponseCode.CODE_EXECUTION_UNAVAILABLE,
                        "Judge0 returned an unexpected status");
            }
            String stdout = decode(row.path("stdout"));
            // Only Accepted (3) passes; a wrong answer (4), any runtime error variant, a
            // time-limit hit or a compilation error never does.
            boolean passed = statusId == 3
                    && normalize(stdout).equals(normalize(testCase.expectedOutput()));
            Integer timeMs = row.path("time").isNumber() ? (int) Math.round(row.path("time").asDouble() * 1000) : null;
            outcomes.add(new CaseOutcome(testCase.testCaseId(), passed, stdout,
                    decode(row.path("stderr")), decode(row.path("compile_output")), timeMs));
        }
        return outcomes;
    }

    /**
     * Polls a batch until every fixture left the queue/processing state. The ceiling covers one
     * full per-case limit plus a safety margin, so a wedged worker never holds the request forever.
     */
    private JsonNode awaitBatch(List<String> tokens, int expected, int timeLimitMs) {
        long waitMillis = Math.min(240_000L, Math.max(30_000L, (long) expected * (timeLimitMs + 2_000L) + 15_000L));
        long deadline = System.currentTimeMillis() + waitMillis;
        String uri = "/submissions/batch?base64_encoded=true&tokens=" + String.join(",", tokens);
        JsonNode rows = null;
        while (System.currentTimeMillis() < deadline) {
            rows = get(uri);
            if (settled(rows, expected)) {
                return rows;
            }
            try {
                Thread.sleep(250);
            } catch (InterruptedException ex) {
                Thread.currentThread().interrupt();
                throw new BaseException(ResponseCode.CODE_EXECUTION_UNAVAILABLE,
                        "Code execution was interrupted");
            }
        }
        throw new BaseException(ResponseCode.CODE_EXECUTION_UNAVAILABLE,
                "Code execution did not finish in time");
    }

    /** Judge0 status 1 = In Queue, 2 = Processing: everything else is a final verdict. */
    private static boolean settled(JsonNode rows, int expected) {
        JsonNode submissions = rows == null ? null : rows.path("submissions");
        if (submissions == null || !submissions.isArray() || submissions.size() != expected) {
            return false;
        }
        for (JsonNode row : submissions) {
            int statusId = row.path("status").path("id").asInt(-1);
            if (statusId == 1 || statusId == 2) {
                return false;
            }
        }
        return true;
    }

    private JsonNode get(String uri) {
        try {
            var request = client.get().uri(uri);
            if (!authToken.isEmpty()) {
                request = request.header("X-Auth-Token", authToken);
            }
            return request.retrieve().body(JsonNode.class);
        } catch (ResourceAccessException ex) {
            log.warn("Judge0 is unreachable: {}", ex.getMessage());
            throw new BaseException(ResponseCode.CODE_EXECUTION_UNAVAILABLE,
                    "Code execution service is unreachable");
        } catch (RuntimeException ex) {
            log.warn("Judge0 batch poll failed: {}", ex.getMessage());
            throw new BaseException(ResponseCode.CODE_EXECUTION_UNAVAILABLE,
                    "Code execution service could not judge this submission");
        }
    }

    private Map<String, Object> submission(String language, String sourceCode, String stdin,
                                           String expectedOutput, int timeLimitMs, int memoryLimitKb) {
        Integer languageId = LANGUAGE_IDS.get(language);
        if (languageId == null) {
            throw new BaseException(ResponseCode.UNSUPPORTED_LANGUAGE, "Language is not supported: " + language);
        }
        Map<String, Object> body = new java.util.LinkedHashMap<>();
        body.put("source_code", encode(sourceCode));
        body.put("language_id", languageId);
        body.put("stdin", encode(stdin));
        if (expectedOutput != null) {
            body.put("expected_output", encode(expectedOutput));
        }
        body.put("cpu_time_limit", Math.max(1, timeLimitMs) / 1000.0);
        body.put("memory_limit", memoryLimitKb);
        return body;
    }

    private JsonNode post(String uri, Object body) {
        try {
            var request = client.post().uri(uri).contentType(MediaType.APPLICATION_JSON);
            if (!authToken.isEmpty()) {
                request = request.header("X-Auth-Token", authToken);
            }
            return request.body(body).retrieve().body(JsonNode.class);
        } catch (ResourceAccessException ex) {
            log.warn("Judge0 is unreachable: {}", ex.getMessage());
            throw new BaseException(ResponseCode.CODE_EXECUTION_UNAVAILABLE,
                    "Code execution service is unreachable");
        } catch (RuntimeException ex) {
            log.warn("Judge0 rejected the submission: {}", ex.getMessage());
            throw new BaseException(ResponseCode.CODE_EXECUTION_UNAVAILABLE,
                    "Code execution service could not judge this submission");
        }
    }

    private static String encode(String value) {
        return Base64.getEncoder().encodeToString((value == null ? "" : value).getBytes(StandardCharsets.UTF_8));
    }

    private static String decode(JsonNode node) {
        if (node == null || node.isNull()) {
            return null;
        }
        String text = node.asText();
        if (text.isEmpty()) {
            return null;
        }
        try {
            return new String(Base64.getDecoder().decode(text), StandardCharsets.UTF_8);
        } catch (IllegalArgumentException ex) {
            return text;
        }
    }

    /** Judge0 compares with trailing whitespace ignored; do the same when scoring locally. */
    private static String normalize(String value) {
        if (value == null) {
            return "";
        }
        return value.replace("\r\n", "\n").stripTrailing();
    }
}
