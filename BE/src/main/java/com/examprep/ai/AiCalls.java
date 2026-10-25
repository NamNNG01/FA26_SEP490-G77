package com.examprep.ai;

import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

/** Provider call with a hard time limit; failures carry the reason code the student APIs report. */
public final class AiCalls {
    public static final String TIMEOUT = "AI_TIMEOUT";
    public static final String UPSTREAM = "AI_UPSTREAM_ERROR";

    private static final ExecutorService CALLS = Executors.newCachedThreadPool(task -> {
        Thread thread = new Thread(task, "student-ai-call");
        thread.setDaemon(true);
        return thread;
    });

    private AiCalls() {}

    public static AiResponse complete(AiClient client, AiRequest request, long timeoutMillis) {
        CompletableFuture<AiResponse> call = CompletableFuture.supplyAsync(() -> client.complete(request), CALLS);
        try {
            return call.get(Math.max(1, timeoutMillis), TimeUnit.MILLISECONDS);
        } catch (TimeoutException ex) {
            call.cancel(true);
            throw new Failure(TIMEOUT);
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            throw new Failure(UPSTREAM);
        } catch (ExecutionException ex) {
            throw new Failure(UPSTREAM);
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
