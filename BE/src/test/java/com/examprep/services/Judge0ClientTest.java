package com.examprep.services;

import com.examprep.dto.ResponseCode;
import com.examprep.exceptions.BaseException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Collections;
import java.util.Deque;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import static org.junit.jupiter.api.Assertions.*;

/**
 * CD-04/CD-05 protocol tests against a local HTTP server that plays Judge0: request encoding,
 * status mapping, batch polling and the fail-fast behaviour while Judge0 is not configured.
 */
class Judge0ClientTest {

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final ExecutorService WORKERS = Executors.newCachedThreadPool();
    private static HttpServer server;
    private static String baseUrl;

    private static final List<Call> CALLS = Collections.synchronizedList(new ArrayList<>());
    private static final Deque<String> POLL_REPLIES = new ArrayDeque<>();
    private static volatile String runReply = "{}";
    private static volatile String batchReply = "{}";
    private static volatile String lastPollReply = "{}";

    private record Call(String method, String uri, String body, String authToken) {}

    @BeforeAll
    static void startJudge0() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.setExecutor(WORKERS);
        server.createContext("/", Judge0ClientTest::handle);
        server.start();
        baseUrl = "http://127.0.0.1:" + server.getAddress().getPort();
    }

    @AfterAll
    static void stopJudge0() {
        server.stop(0);
        WORKERS.shutdownNow();
    }

    @BeforeEach
    void resetJudge0() {
        CALLS.clear();
        POLL_REPLIES.clear();
        lastPollReply = "{}";
        runReply = "{}";
        batchReply = "{}";
    }

    // =================================================================================
    // CD-04 run
    // =================================================================================

    @Test
    void runSendsBase64FieldsAndMapsTheAcceptedOutput() throws Exception {
        runReply = """
                {"status":{"id":3},"stdout":"Y2JhCg==","stderr":"","compile_output":null,"time":0.12}""";
        Judge0Client client = new Judge0Client(baseUrl + "/", "secret-token", true);

        Judge0Client.RunOutcome outcome = client.run("JAVA", "System.out.print(\"cba\");", "abc", 2_000, 131_072);

        assertEquals("COMPLETED", outcome.status());
        assertEquals("cba\n", outcome.stdout());
        assertNull(outcome.stderr());
        assertEquals(Integer.valueOf(120), outcome.executionTimeMs());

        assertEquals(1, CALLS.size());
        Call call = CALLS.get(0);
        assertEquals("POST", call.method());
        assertEquals("/submissions?base64_encoded=true&wait=true", call.uri());
        assertEquals("secret-token", call.authToken());
        JsonNode body = JSON.readTree(call.body());
        assertEquals(base64("System.out.print(\"cba\");"), body.path("source_code").asText());
        assertEquals(62, body.path("language_id").asInt());
        assertEquals(base64("abc"), body.path("stdin").asText());
        assertEquals(2.0, body.path("cpu_time_limit").asDouble());
        assertEquals(131_072, body.path("memory_limit").asInt());
        assertFalse(body.has("expected_output"));
    }

    @Test
    void runMapsCompileRuntimeAndLimitVerdictsToFailed() {
        Judge0Client client = new Judge0Client(baseUrl, "", true);

        runReply = """
                {"status":{"id":6},"stdout":null,"stderr":null,"compile_output":"%s","time":null}"""
                .formatted(base64("error: ';' expected"));
        Judge0Client.RunOutcome compile = client.run("JAVA", "broken", "", 5_000, 262_144);
        assertEquals("FAILED", compile.status());
        assertNull(compile.stdout());
        assertEquals("error: ';' expected", compile.stderr());
        assertNull(compile.executionTimeMs());

        runReply = """
                {"status":{"id":7},"stdout":null,"stderr":"%s","time":null}"""
                .formatted(base64("IndexOutOfBoundsException"));
        Judge0Client.RunOutcome runtime = client.run("PYTHON", "x", "", 5_000, 262_144);
        assertEquals("FAILED", runtime.status());
        assertEquals("IndexOutOfBoundsException", runtime.stderr());

        runReply = """
                {"status":{"id":5},"stdout":null,"stderr":null,"time":null}""";
        Judge0Client.RunOutcome slow = client.run("C", "x", "", 1_000, 262_144);
        assertEquals("FAILED", slow.status());
        assertTrue(slow.stderr().contains("time limit"));

        runReply = """
                {"status":{"id":14},"stdout":null,"stderr":null,"time":null}""";
        Judge0Client.RunOutcome execFormat = client.run("CPP", "x", "", 1_000, 262_144);
        assertEquals("FAILED", execFormat.status());

        runReply = """
                {"status":{"id":13},"stdout":null,"stderr":null,"time":null}""";
        BaseException internal = assertThrows(BaseException.class,
                () -> client.run("JAVA", "x", "", 1_000, 262_144));
        assertEquals(ResponseCode.CODE_EXECUTION_UNAVAILABLE, internal.getResponseCode());

        // An unknown status id is a protocol problem, never a completed run.
        runReply = """
                {"status":{"id":0},"stdout":"%s","time":null}"""
                .formatted(base64("cba"));
        BaseException unknown = assertThrows(BaseException.class,
                () -> client.run("JAVA", "x", "", 1_000, 262_144));
        assertEquals(ResponseCode.CODE_EXECUTION_UNAVAILABLE, unknown.getResponseCode());

        assertNull(CALLS.get(0).authToken()); // no token configured: no header is sent
    }

    @Test
    void runRejectsUnsupportedLanguagesBeforeCallingJudge0() {
        Judge0Client client = new Judge0Client(baseUrl, "", true);

        BaseException ex = assertThrows(BaseException.class,
                () -> client.run("RUBY", "puts 1", "", 5_000, 262_144));

        assertEquals(ResponseCode.UNSUPPORTED_LANGUAGE, ex.getResponseCode());
        assertEquals(0, CALLS.size());
        assertTrue(Judge0Client.supports("JAVA"));
        assertTrue(Judge0Client.supports("PYTHON"));
        assertTrue(Judge0Client.supports("C"));
        assertTrue(Judge0Client.supports("CPP"));
        assertFalse(Judge0Client.supports("RUBY"));
        assertFalse(Judge0Client.supports(null));
    }

    @Test
    void disabledClientFailsFastWithoutAnyCall() {
        Judge0Client client = new Judge0Client(baseUrl, "", false);

        BaseException run = assertThrows(BaseException.class,
                () -> client.run("JAVA", "x", "", 1_000, 262_144));
        assertEquals(ResponseCode.CODE_EXECUTION_UNAVAILABLE, run.getResponseCode());
        BaseException judge = assertThrows(BaseException.class,
                () -> client.judge("JAVA", "x", List.of(new Judge0Client.CaseInput(1L, "in", "out")),
                        1_000, 262_144));
        assertEquals(ResponseCode.CODE_EXECUTION_UNAVAILABLE, judge.getResponseCode());
        assertEquals(0, CALLS.size());
    }

    // =================================================================================
    // CD-05 judge: batch submission + polling
    // =================================================================================

    @Test
    void judgePollsUntilEveryCaseSettlesAndScoresEachOutput() throws Exception {
        batchReply = """
                {"submissions":[{"token":"t1"},{"token":"t2"}]}""";
        // First poll: still queued/processing. Second poll: final verdicts.
        POLL_REPLIES.add("""
                {"submissions":[{"status":{"id":1}},{"status":{"id":2}}]}""");
        POLL_REPLIES.add("""
                {"submissions":[
                  {"status":{"id":3},"stdout":"%s","stderr":null,"compile_output":null,"time":0.01},
                  {"status":{"id":3},"stdout":"%s","stderr":null,"compile_output":null,"time":0.02}]}"""
                .formatted(base64("3\n"), base64("wrong\n")));
        Judge0Client client = new Judge0Client(baseUrl, "", true);

        List<Judge0Client.CaseOutcome> outcomes = client.judge("PYTHON", "print(1)",
                List.of(new Judge0Client.CaseInput(11L, "1 2", "3"),
                        new Judge0Client.CaseInput(22L, "5 7", "12")),
                2_000, 131_072);

        assertEquals(2, outcomes.size());
        assertEquals(11L, outcomes.get(0).testCaseId().longValue());
        assertTrue(outcomes.get(0).passed());
        assertEquals("3\n", outcomes.get(0).stdout());
        assertEquals(Integer.valueOf(10), outcomes.get(0).timeMs());
        assertEquals(22L, outcomes.get(1).testCaseId().longValue());
        assertFalse(outcomes.get(1).passed());
        assertEquals("wrong\n", outcomes.get(1).stdout());

        assertEquals(3, CALLS.size()); // create batch + two polls
        JsonNode batch = JSON.readTree(CALLS.get(0).body());
        assertEquals(2, batch.path("submissions").size());
        JsonNode firstSubmission = batch.path("submissions").get(0);
        assertEquals(71, firstSubmission.path("language_id").asInt());
        assertEquals(base64("1 2"), firstSubmission.path("stdin").asText());
        assertEquals(base64("3"), firstSubmission.path("expected_output").asText());
        assertEquals("/submissions/batch?base64_encoded=true&tokens=t1,t2", CALLS.get(1).uri());
        assertEquals(CALLS.get(1).uri(), CALLS.get(2).uri());
    }

    @Test
    void judgeIgnoresTrailingWhitespaceAndNewlines() {
        batchReply = """
                {"submissions":[{"token":"t1"}]}""";
        lastPollReply = """
                {"submissions":[{"status":{"id":3},"stdout":"%s","time":0.05}]}"""
                .formatted(base64("cba\n\n"));

        List<Judge0Client.CaseOutcome> outcomes = new Judge0Client(baseUrl, "", true)
                .judge("JAVA", "x", List.of(new Judge0Client.CaseInput(1L, "abc", "cba")), 1_000, 65_536);

        assertTrue(outcomes.get(0).passed());
        assertEquals(Integer.valueOf(50), outcomes.get(0).timeMs());
    }

    @Test
    void judgeTreatsFailedRunsAsFailuresEvenWhenStdoutMatches() {
        batchReply = """
                {"submissions":[{"token":"a"},{"token":"b"},{"token":"c"}]}""";
        lastPollReply = """
                {"submissions":[
                  {"status":{"id":7},"stdout":"%s","stderr":"%s"},
                  {"status":{"id":5},"stdout":"%s","stderr":"%s"},
                  {"status":{"id":6},"stdout":"%s","compile_output":"%s"}]}"""
                .formatted(base64("ok"), base64("time"), base64("ok"), base64("boom"), base64("ok"), base64("CE"));

        List<Judge0Client.CaseOutcome> outcomes = new Judge0Client(baseUrl, "", true).judge(
                "C", "x", List.of(new Judge0Client.CaseInput(1L, "", "ok"),
                        new Judge0Client.CaseInput(2L, "", "ok"),
                        new Judge0Client.CaseInput(3L, "", "ok")),
                1_000, 65_536);

        assertFalse(outcomes.get(0).passed()); // runtime error
        assertFalse(outcomes.get(1).passed()); // time limit
        assertFalse(outcomes.get(2).passed()); // compilation error
        assertEquals("boom", outcomes.get(1).stderr());
        assertEquals("CE", outcomes.get(2).compileOutput());
    }

    @Test
    void judgeFailsAsUnavailableOnInternalErrorsOrMissingTokens() {
        batchReply = """
                {"submissions":[{"token":"t1"}]}""";
        lastPollReply = """
                {"submissions":[{"status":{"id":13}}]}""";
        Judge0Client client = new Judge0Client(baseUrl, "", true);
        BaseException internal = assertThrows(BaseException.class, () -> client.judge("JAVA", "x",
                List.of(new Judge0Client.CaseInput(1L, "", "out")), 1_000, 65_536));
        assertEquals(ResponseCode.CODE_EXECUTION_UNAVAILABLE, internal.getResponseCode());

        batchReply = """
                {"submissions":[]}""";
        BaseException missing = assertThrows(BaseException.class, () -> client.judge("JAVA", "x",
                List.of(new Judge0Client.CaseInput(1L, "", "out")), 1_000, 65_536));
        assertEquals(ResponseCode.CODE_EXECUTION_UNAVAILABLE, missing.getResponseCode());

        batchReply = """
                {"submissions":[{"token":"t1"}]}""";
        lastPollReply = """
                {"submissions":[{"status":{"id":0}}]}""";
        BaseException unknown = assertThrows(BaseException.class, () -> client.judge("JAVA", "x",
                List.of(new Judge0Client.CaseInput(1L, "", "out")), 1_000, 65_536));
        assertEquals(ResponseCode.CODE_EXECUTION_UNAVAILABLE, unknown.getResponseCode());
    }

    @Test
    void judgeWithoutCasesMakesNoCall() {
        List<Judge0Client.CaseOutcome> outcomes = new Judge0Client(baseUrl, "", true)
                .judge("JAVA", "x", List.of(), 1_000, 65_536);

        assertTrue(outcomes.isEmpty());
        assertEquals(0, CALLS.size());
    }

    // =================================================================================
    // fake Judge0
    // =================================================================================

    private static void handle(HttpExchange exchange) throws IOException {
        String body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
        CALLS.add(new Call(exchange.getRequestMethod(), exchange.getRequestURI().toString(), body,
                exchange.getRequestHeaders().getFirst("X-Auth-Token")));
        String path = exchange.getRequestURI().getPath();
        if ("POST".equals(exchange.getRequestMethod()) && "/submissions".equals(path)) {
            reply(exchange, runReply);
        } else if ("POST".equals(exchange.getRequestMethod()) && "/submissions/batch".equals(path)) {
            reply(exchange, batchReply);
        } else if ("GET".equals(exchange.getRequestMethod()) && "/submissions/batch".equals(path)) {
            String next = POLL_REPLIES.isEmpty() ? lastPollReply : POLL_REPLIES.pollFirst();
            lastPollReply = next;
            reply(exchange, next);
        } else {
            exchange.sendResponseHeaders(404, -1);
            exchange.close();
        }
    }

    private static void reply(HttpExchange exchange, String body) throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().add("Content-Type", "application/json");
        exchange.sendResponseHeaders(200, bytes.length);
        try (OutputStream out = exchange.getResponseBody()) {
            out.write(bytes);
        }
    }

    private static String base64(String value) {
        return Base64.getEncoder().encodeToString(value.getBytes(StandardCharsets.UTF_8));
    }
}
