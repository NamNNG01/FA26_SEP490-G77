package com.examprep.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

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

    /** API 22/23 body: the plan is fully described by this payload (update replaces every field). */
    public record PlanWriteRequest(
            @NotBlank @Size(max = 100) String planName,
            @Size(max = 1000) String description,
            @NotNull @DecimalMin(value = "0") BigDecimal price,
            @NotNull @Min(1) Integer durationDays,
            @NotNull @Min(0) Integer aiTokenLimit,
            List<@Size(max = 200) String> features,
            Boolean isActive,
            Integer sortOrder
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
