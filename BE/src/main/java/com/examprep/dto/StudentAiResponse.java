package com.examprep.dto;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;

public final class StudentAiResponse {
    private StudentAiResponse() {}

    /** Quota left after the call, as SE-01/SE-02 return it. */
    public record QuotaLeft(long freeRemaining, long planRemaining, LocalDate planEndDate) { }

    // SE-01
    public record ExplanationBatch(List<ExplanationItem> items, ExplanationSummary summary, QuotaLeft quota,
                                   List<Long> duplicatesIgnored) { }

    public record ExplanationItem(Long questionId, String explanation, String source, String reason) { }

    public record ExplanationSummary(int requested, int returned, int generated, int cached, int manager,
                                     int notApplicable, int failed, int quotaExceeded) { }

    // SE-02
    public record Grading(Long attemptId, String attemptStatus, List<GradingItem> items, List<Skipped> skipped,
                          QuotaLeft quota) { }

    public record GradingItem(Long questionId, Long attemptAnswerId, String status, BigDecimal maxPoints,
                              long reservedTokens, String gradingError) { }

    public record Skipped(Long questionId, String reason) { }

    /** 402 payload of SE-02. */
    public record GradingQuotaExceeded(long requiredTokens, long availableTokens, QuotaLeft quota) { }

    // SQ-01
    public record Quota(String timezone, Free free, Plan plan, ExpiredPlan expiredPlan, long reservedPending) { }

    public record Free(long dailyLimit, long usedToday, long remaining, OffsetDateTime resetAt) { }

    public record Plan(String planName, long tokenLimit, long tokenUsed, long remaining,
                       OffsetDateTime startDate, OffsetDateTime endDate) { }

    public record ExpiredPlan(String planName, OffsetDateTime endDate) { }
}
