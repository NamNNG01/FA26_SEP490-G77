package com.examprep.ai;

import lombok.extern.slf4j.Slf4j;

import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

/** Provider call with a hard time limit; failures carry the reason code the student APIs report. */
@Slf4j
public final class AiCalls {
    public static final String TIMEOUT = "AI_TIMEOUT";
    public static final String UPSTREAM = "AI_UPSTREAM_ERROR";
    static long retryDelayMillis = 1500;

    private static final ExecutorService CALLS = Executors.newCachedThreadPool(task -> {
        Thread thread = new Thread(task, "student-ai-call");
        thread.setDaemon(true);
        return thread;
    });

    private AiCalls() {}

    public static AiResponse complete(AiClient client, AiRequest request, long timeoutMillis) {
        CompletableFuture<AiResponse> call = CompletableFuture.supplyAsync(() -> completeOnce(client, request, true), CALLS);
        try {
            return call.get(Math.max(1, timeoutMillis), TimeUnit.MILLISECONDS);
        } catch (TimeoutException ex) {
            call.cancel(true);
            log.warn("AI call timed out after {} ms", timeoutMillis);
            throw new Failure(TIMEOUT);
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            throw new Failure(UPSTREAM);
        } catch (ExecutionException ex) {
            log.warn("AI call failed: {}", ex.getCause() == null ? ex.getMessage() : ex.getCause().getMessage());
            throw new Failure(UPSTREAM);
        }
    }

    /** Gemini answers 503 "high demand" often enough that one retry inside the caller's time limit is worth it. */
    private static AiResponse completeOnce(AiClient client, AiRequest request, boolean mayRetry) {
        try {
            return client.complete(request);
        } catch (RuntimeException ex) {
            if (!mayRetry || ex.getMessage() == null || !ex.getMessage().contains("HTTP 503")) throw ex;
            log.warn("AI provider overloaded, retrying once in {} ms", retryDelayMillis);
            try {
                Thread.sleep(retryDelayMillis);
            } catch (InterruptedException interrupted) {
                Thread.currentThread().interrupt();
                throw ex;
            }
            return completeOnce(client, request, false);
        }
    }

    public static final class Failure extends RuntimeException {
        private final String reason;

        public Failure(String reason) {
            super(reason, null, false, false);
            this.reason = reason;
        }

        public String reason() { return reason; }
    }
}
