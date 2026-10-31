package com.examprep.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

/** Group C (admin subscription-plan config) payloads — Deadline 2 API 20–27. */
public final class AdminPlanDtos {
    private AdminPlanDtos() {}

    /** The DB has no currency column; the API always reports the plan prices in VND. */
    public static final String CURRENCY = "VND";

    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record PlanItem(
            Long planId,
            String planName,
            String description,
            BigDecimal price,
            String currency,
            Integer durationDays,
            Integer aiTokenLimit,
            List<String> features,
            Boolean isActive,
            Integer sortOrder,
            long activeSubscribers
    ) {}

    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record PlanDetail(
            Long planId,
            String planName,
            String description,
            BigDecimal price,
            String currency,
            Integer durationDays,
            Integer aiTokenLimit,
            List<String> features,
            Boolean isActive,
            Integer sortOrder,
            long activeSubscribers,
            long totalSubscribers,
            Instant createdAt,
            Instant updatedAt
    ) {}

    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record PublicPlanItem(
            Long planId,
            String planName,
            String description,
            BigDecimal price,
            String currency,
            Integer durationDays,
            Integer aiTokenLimit,
            List<String> features,
            Boolean isActive,
            Integer sortOrder
    ) {}
}
