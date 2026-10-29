package com.examprep.ai;

import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class AiCallsTest {
    private static final AiRequest REQUEST = AiRequest.builder().prompt("p").build();
    private static final AiResponse OK = AiResponse.builder().text("{}").build();

    @BeforeAll
    static void fastRetry() { AiCalls.retryDelayMillis = 1; }

    @Test
    void retriesOnceWhenGeminiIsOverloaded() {
        AtomicInteger calls = new AtomicInteger();
        AiClient client = request -> {
            if (calls.incrementAndGet() == 1) throw new RuntimeException("Gemini completion failed: Gemini API error: HTTP 503 SERVICE_UNAVAILABLE");
            return OK;
        };
        assertThat(AiCalls.complete(client, REQUEST, 5_000)).isSameAs(OK);
        assertThat(calls).hasValue(2);
    }

    @Test
    void givesUpAfterTheSecond503() {
        AtomicInteger calls = new AtomicInteger();
        AiClient client = request -> {
            calls.incrementAndGet();
            throw new RuntimeException("Gemini API error: HTTP 503 SERVICE_UNAVAILABLE");
        };
        assertThatThrownBy(() -> AiCalls.complete(client, REQUEST, 5_000))
                .isInstanceOfSatisfying(AiCalls.Failure.class, f -> assertThat(f.reason()).isEqualTo(AiCalls.UPSTREAM));
        assertThat(calls).hasValue(2);
    }

    @Test
    void otherErrorsAreNotRetried() {
        AtomicInteger calls = new AtomicInteger();
        AiClient client = request -> {
            calls.incrementAndGet();
            throw new RuntimeException("Gemini API error: HTTP 400 BAD_REQUEST");
        };
        assertThatThrownBy(() -> AiCalls.complete(client, REQUEST, 5_000)).isInstanceOf(AiCalls.Failure.class);
        assertThat(calls).hasValue(1);
    }
}
