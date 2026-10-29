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
import java.util.ArrayList;
import java.util.Collections;
import java.util.Deque;
import java.util.List;
import java.util.concurrent.ConcurrentLinkedDeque;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.*;

/**
 * CD-04/CD-05 protocol tests against a local HTTP server that plays the Piston v2 API: request
 * shape, auth header, verdict mapping (compile, runtime, timeout, signal, output flood, internal
 * error), output comparison and the fail-fast behaviour while no provider key is configured.
 */
class PistonClientTest {

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final ExecutorService WORKERS = Executors.newCachedThreadPool();
    private static HttpServer server;
    private static String baseUrl;

    private static final List<Call> CALLS = Collections.synchronizedList(new ArrayList<>());
    private static final Deque<String> REPLIES = new ConcurrentLinkedDeque<>();
    private static final AtomicInteger HTTP_STATUS = new AtomicInteger(200);

    private record Call(String method, String uri, String body, String authorization) {}

    @BeforeAll
    static void startPiston() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.setExecutor(WORKERS);
        server.createContext("/", PistonClientTest::handle);
        server.start();
        baseUrl = "http://127.0.0.1:" + server.getAddress().getPort();
    }

    @AfterAll
    static void stopPiston() {
        server.stop(0);
        WORKERS.shutdownNow();
    }

    @BeforeEach
    void resetServer() {
        CALLS.clear();
        REPLIES.clear();
        HTTP_STATUS.set(200);
    }

    // =================================================================================
    // CD-04 run
    // =================================================================================

    @Test
    void runSendsPistonPayloadAndMapsTheAcceptedOutput() throws Exception {
        REPLIES.add("""
                {"language":"java","version":"25","run":{"stdout":"cba\\n","stderr":"","output":"cba\\n",
                 "code":0,"signal":null,"status":null,"wall_time":120}}""");
        PistonClient client = new PistonClient(baseUrl + "/", "secret-key");

        PistonClient.RunOutcome outcome = client.run("JAVA", "public class Solution { }", "abc", 2_000, 131_072);

        assertEquals("COMPLETED", outcome.status());
        assertEquals("cba\n", outcome.stdout());
        assertNull(outcome.stderr());
        assertEquals(Integer.valueOf(120), outcome.executionTimeMs());

        assertEquals(1, CALLS.size());
        Call call = CALLS.get(0);
        assertEquals("POST", call.method());
        assertEquals("/execute", call.uri());
        assertEquals("secret-key", call.authorization());
        JsonNode body = JSON.readTree(call.body());
        assertEquals("java", body.path("language").asText());
        assertEquals("*", body.path("version").asText());
        assertEquals("Solution.java", body.path("files").get(0).path("name").asText());
        assertEquals("public class Solution { }", body.path("files").get(0).path("content").asText());
        assertEquals("abc", body.path("stdin").asText());
        assertEquals(2_000, body.path("run_timeout").asInt());
        assertEquals(10_000, body.path("compile_timeout").asInt());
        assertEquals(131_072L * 1024L, body.path("run_memory_limit").asLong());
        assertFalse(body.has("expected_output"));
    }

    @Test
    void runMapsSelfHostedCompileStageFailure() {
        REPLIES.add("""
                {"compile":{"stdout":"","stderr":"Main.java:1: error: ';' expected","code":1,"signal":null},
                 "run":{"stdout":"","stderr":"","output":"","code":0,"signal":null,"wall_time":40}}""");
        PistonClient client = new PistonClient(baseUrl, "secret-key");

        PistonClient.RunOutcome outcome = client.run("JAVA", "public class Main { }", "", 5_000, 262_144);

        assertEquals("FAILED", outcome.status());
        assertNull(outcome.stdout());
        assertEquals("Main.java:1: error: ';' expected", outcome.stderr());
        assertEquals(Integer.valueOf(40), outcome.executionTimeMs());
    }

    @Test
    void runMapsHostedCompileErrorAndRuntimeErrorFromRunStderr() {
        PistonClient client = new PistonClient(baseUrl, "secret-key");
        REPLIES.add("""
                {"run":{"stdout":"","stderr":"Main.java:1: error: ';' expected","code":1,
                 "signal":null,"status":"RE","wall_time":null}}""");
        PistonClient.RunOutcome compile = client.run("JAVA", "broken", "", 5_000, 262_144);
        assertEquals("FAILED", compile.status());
        assertNull(compile.stdout());
        assertEquals("Main.java:1: error: ';' expected", compile.stderr());
        assertNull(compile.executionTimeMs());

        REPLIES.add("""
                {"run":{"stdout":"","stderr":"IndexOutOfBoundsException","code":1,
                 "signal":null,"status":"RE","wall_time":55}}""");
        PistonClient.RunOutcome runtime = client.run("PYTHON", "x", "", 5_000, 262_144);
        assertEquals("FAILED", runtime.status());
        assertEquals("IndexOutOfBoundsException", runtime.stderr());
        assertEquals(Integer.valueOf(55), runtime.executionTimeMs());

        REPLIES.add("""
                {"run":{"stdout":"partial","stderr":"","code":3,"signal":null,"status":"RE"}}""");
        PistonClient.RunOutcome noMessage = client.run("C", "x", "", 5_000, 262_144);
        assertEquals("FAILED", noMessage.status());
        assertEquals("Execution failed with exit code 3", noMessage.stderr());
    }

    @Test
    void runMapsTimeoutSignalOutputLimitAndInternalErrors() {
        PistonClient client = new PistonClient(baseUrl, "secret-key");

        REPLIES.add("""
                {"run":{"stdout":"","stderr":"","code":124,"signal":null,"status":"TO","wall_time":2000}}""");
        PistonClient.RunOutcome timeout = client.run("PYTHON", "while True: pass", "", 1_000, 262_144);
        assertEquals("FAILED", timeout.status());
        assertTrue(timeout.stderr().contains("time limit"));
        assertEquals(Integer.valueOf(2000), timeout.executionTimeMs());

        REPLIES.add("""
                {"run":{"stdout":"","stderr":"","code":137,"signal":"SIGKILL","status":null}}""");
        PistonClient.RunOutcome killed = client.run("C", "x", "", 1_000, 262_144);
        assertEquals("FAILED", killed.status());
        assertTrue(killed.stderr().contains("time limit"));

        REPLIES.add("""
                {"run":{"stdout":"","stderr":"","code":153,"signal":null,"status":"OL"}}""");
        PistonClient.RunOutcome flood = client.run("CPP", "x", "", 1_000, 262_144);
        assertEquals("FAILED", flood.status());
        assertTrue(flood.stderr().contains("output limit"));

        REPLIES.add("""
                {"run":{"stdout":"","stderr":"","code":null,"signal":null,"status":"XX"}}""");
        BaseException internal = assertThrows(BaseException.class,
                () -> client.run("JAVA", "x", "", 1_000, 262_144));
        assertEquals(ResponseCode.CODE_EXECUTION_UNAVAILABLE, internal.getResponseCode());

        REPLIES.add("""
                {"run":{"stdout":"","stderr":"","code":null,"signal":null,"status":null}}""");
        BaseException noCode = assertThrows(BaseException.class,
                () -> client.run("JAVA", "x", "", 1_000, 262_144));
        assertEquals(ResponseCode.CODE_EXECUTION_UNAVAILABLE, noCode.getResponseCode());
    }

    @Test
    void runClampsProviderTimeoutsToItsSupportedRange() throws Exception {
        PistonClient client = new PistonClient(baseUrl, "secret-key");
        REPLIES.add("""
                {"run":{"stdout":"","stderr":"","code":0,"signal":null,"status":null}}""");
        REPLIES.add("""
                {"run":{"stdout":"","stderr":"","code":0,"signal":null,"status":null}}""");

        client.run("PYTHON", "print(1)", "", 500, 65_536);
        client.run("PYTHON", "print(1)", "", 60_000, 65_536);

        assertEquals(1_000, JSON.readTree(CALLS.get(0).body()).path("run_timeout").asInt());
        assertEquals(30_000, JSON.readTree(CALLS.get(1).body()).path("run_timeout").asInt());
    }

    @Test
    void runRejectsUnsupportedLanguagesBeforeAnyCall() {
        PistonClient client = new PistonClient(baseUrl, "secret-key");

        BaseException ex = assertThrows(BaseException.class,
                () -> client.run("RUBY", "puts 1", "", 5_000, 262_144));

        assertEquals(ResponseCode.UNSUPPORTED_LANGUAGE, ex.getResponseCode());
        assertEquals(0, CALLS.size());
        assertTrue(PistonClient.supports("JAVA"));
        assertTrue(PistonClient.supports("PYTHON"));
        assertTrue(PistonClient.supports("C"));
        assertTrue(PistonClient.supports("CPP"));
        assertFalse(PistonClient.supports("RUBY"));
        assertFalse(PistonClient.supports(null));
    }

    @Test
    void blankApiKeyFailsFastWithoutAnyCall() {
        PistonClient client = new PistonClient(baseUrl, "");

        BaseException run = assertThrows(BaseException.class,
                () -> client.run("JAVA", "x", "", 1_000, 262_144));
        assertEquals(ResponseCode.CODE_EXECUTION_UNAVAILABLE, run.getResponseCode());
        BaseException judge = assertThrows(BaseException.class,
                () -> client.judge("JAVA", "x", List.of(new PistonClient.CaseInput(1L, "in", "out")),
                        1_000, 262_144));
        assertEquals(ResponseCode.CODE_EXECUTION_UNAVAILABLE, judge.getResponseCode());
        assertEquals(0, CALLS.size());
    }

    // =================================================================================
    // CD-05 judge
    // =================================================================================

    @Test
    void judgeScoresEveryCaseInOrderAndMapsCompileErrors() throws Exception {
        REPLIES.add("""
                {"compile":{"stdout":"","stderr":"CE","code":1}}""");
        REPLIES.add("""
                {"run":{"stdout":"3\\n","stderr":"","code":0,"signal":null,"status":null,"wall_time":11}}""");
        REPLIES.add("""
                {"run":{"stdout":"wrong\\n","stderr":"","code":0,"signal":null,"status":null,"wall_time":12}}""");
        REPLIES.add("""
                {"run":{"stdout":"","stderr":"boom","code":1,"signal":null,"status":"RE","wall_time":13}}""");
        PistonClient client = new PistonClient(baseUrl, "secret-key");

        List<PistonClient.CaseOutcome> outcomes = client.judge("PYTHON", "print(1)",
                List.of(new PistonClient.CaseInput(11L, "a", "b"),
                        new PistonClient.CaseInput(22L, "1 2", "3"),
                        new PistonClient.CaseInput(33L, "", "12"),
                        new PistonClient.CaseInput(44L, "", "ok")),
                2_000, 131_072);

        assertEquals(4, outcomes.size());
        PistonClient.CaseOutcome compile = outcomes.get(0);
        assertEquals(11L, compile.testCaseId().longValue());
        assertFalse(compile.passed());
        assertNull(compile.stdout());
        assertEquals("CE", compile.stderr());
        assertEquals("CE", compile.compileOutput());

        PistonClient.CaseOutcome accepted = outcomes.get(1);
        assertEquals(22L, accepted.testCaseId().longValue());
        assertTrue(accepted.passed());
        assertEquals("3\n", accepted.stdout());
        assertEquals(Integer.valueOf(11), accepted.timeMs());

        PistonClient.CaseOutcome wrong = outcomes.get(2);
        assertEquals(33L, wrong.testCaseId().longValue());
        assertFalse(wrong.passed());
        assertEquals("wrong\n", wrong.stdout());

        PistonClient.CaseOutcome failed = outcomes.get(3);
        assertEquals(44L, failed.testCaseId().longValue());
        assertFalse(failed.passed());
        assertEquals("boom", failed.stderr());

        assertEquals(4, CALLS.size());
        JsonNode first = JSON.readTree(CALLS.get(0).body());
        assertEquals("python", first.path("language").asText());
        assertEquals("main.py", first.path("files").get(0).path("name").asText());
        assertEquals("a", first.path("stdin").asText());
        assertEquals("1 2", JSON.readTree(CALLS.get(1).body()).path("stdin").asText());
    }

    @Test
    void judgeIgnoresTrailingWhitespaceAndNewlines() {
        REPLIES.add("""
                {"run":{"stdout":"cba\\r\\n\\r\\n","stderr":"","code":0,"signal":null,"status":null,"wall_time":50}}""");

        List<PistonClient.CaseOutcome> outcomes = new PistonClient(baseUrl, "secret-key")
                .judge("JAVA", "x", List.of(new PistonClient.CaseInput(1L, "abc", "cba")), 1_000, 65_536);

        assertTrue(outcomes.get(0).passed());
        assertEquals(Integer.valueOf(50), outcomes.get(0).timeMs());
    }

    @Test
    void judgeTreatsNonZeroExitAsFailureEvenWhenStdoutMatches() {
        REPLIES.add("""
                {"run":{"stdout":"ok","stderr":"","code":7,"signal":null,"status":"RE"}}""");

        List<PistonClient.CaseOutcome> outcomes = new PistonClient(baseUrl, "secret-key")
                .judge("CPP", "x", List.of(new PistonClient.CaseInput(1L, "", "ok")), 1_000, 65_536);

        assertFalse(outcomes.get(0).passed());
        assertEquals("Execution failed with exit code 7", outcomes.get(0).stderr());
    }

    @Test
    void judgeWithoutCasesMakesNoCall() {
        List<PistonClient.CaseOutcome> outcomes = new PistonClient(baseUrl, "secret-key")
                .judge("JAVA", "x", List.of(), 1_000, 65_536);

        assertTrue(outcomes.isEmpty());
        assertEquals(0, CALLS.size());
    }

    @Test
    void javaFileNameFollowsThePublicType() throws Exception {
        PistonClient client = new PistonClient(baseUrl, "secret-key");
        REPLIES.add("""
                {"run":{"stdout":"","stderr":"","code":0,"signal":null,"status":null}}""");
        REPLIES.add("""
                {"run":{"stdout":"","stderr":"","code":0,"signal":null,"status":null}}""");

        client.run("JAVA", "public class Main { }", "", 1_000, 65_536);
        client.run("JAVA", "class Helper { }", "", 1_000, 65_536);

        assertEquals("Main.java", JSON.readTree(CALLS.get(0).body()).path("files").get(0).path("name").asText());
        assertEquals("Main.java", JSON.readTree(CALLS.get(1).body()).path("files").get(0).path("name").asText());
    }

    // =================================================================================
    // transport failures
    // =================================================================================

    @Test
    void providerHttpErrorsMapToUnavailable() {
        PistonClient client = new PistonClient(baseUrl, "secret-key");

        HTTP_STATUS.set(401);
        BaseException unauthorized = assertThrows(BaseException.class,
                () -> client.run("JAVA", "x", "", 1_000, 65_536));
        assertEquals(ResponseCode.CODE_EXECUTION_UNAVAILABLE, unauthorized.getResponseCode());

        HTTP_STATUS.set(429);
        BaseException rateLimited = assertThrows(BaseException.class,
                () -> client.run("JAVA", "x", "", 1_000, 65_536));
        assertEquals(ResponseCode.CODE_EXECUTION_UNAVAILABLE, rateLimited.getResponseCode());

        assertEquals(2, CALLS.size());
    }

    // =================================================================================
    // fake Piston
    // =================================================================================

    private static void handle(HttpExchange exchange) throws IOException {
        String body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
        CALLS.add(new Call(exchange.getRequestMethod(), exchange.getRequestURI().toString(), body,
                exchange.getRequestHeaders().getFirst("Authorization")));
        String path = exchange.getRequestURI().getPath();
        if ("POST".equals(exchange.getRequestMethod()) && "/execute".equals(path)) {
            int status = HTTP_STATUS.get();
            if (status != 200) {
                reply(exchange, status, "{\"message\":\"provider error\"}");
                return;
            }
            String next = REPLIES.pollFirst();
            reply(exchange, 200, next == null ? "{}" : next);
        } else {
            exchange.sendResponseHeaders(404, -1);
            exchange.close();
        }
    }

    private static void reply(HttpExchange exchange, int status, String body) throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().add("Content-Type", "application/json");
        exchange.sendResponseHeaders(status, bytes.length);
        try (OutputStream out = exchange.getResponseBody()) {
            out.write(bytes);
        }
    }
}
