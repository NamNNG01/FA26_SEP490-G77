package com.examprep.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.time.Instant;
import java.util.List;

/** Group E (AI flashcard generation + AI usage) payloads — Deadline 2 API 31–33. */
public final class AiFlashcardDtos {
    private AiFlashcardDtos() {}

    /** API 31 response: the generation job is queued; poll API 32 with {@code generationId}. */
    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record GenerateAccepted(
            Long generationId,
            String status,
            Integer reservedTokens
    ) {}

    /** One generated card before it is saved into a deck ({@code tempId} such as {@code c1} is stable inside one generation). */
    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record GenerationCard(
            String tempId,
            String frontText,
            String backText
    ) {}

    /** Token accounting of a finished (or failed/refunded) generation. */
    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record GenerationUsage(
            Integer inputTokens,
            Integer outputTokens,
            Long remainingTokens
    ) {}

    /** API 32 response: {@code status} is PENDING/PROCESSING/SUCCESS/FAILED; errors carry code + message. */
    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record GenerationDetail(
            Long generationId,
            String status,
            List<GenerationCard> cards,
            GenerationUsage usage,
            boolean saved,
            String errorCode,
            String errorMessage
    ) {}

    /**
     * API 33 response: the quota window currently enforced. FREE_QUOTA is the daily allowance
     * ({@code [00:00, 24:00)} Asia/Ho_Chi_Minh); SUBSCRIPTION is PLAN (kỳ hạn của subscription đang
     * chạy: {@code [startDate, endDate]} của gói {@code durationDays} ngày).
     */
    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record UsageInfo(
            String billingSource,
            String planName,
            long tokenLimit,
            long tokenUsed,
            long tokenReserved,
            long tokenRemaining,
            Instant periodStart,
            Instant periodEnd
    ) {}
}
