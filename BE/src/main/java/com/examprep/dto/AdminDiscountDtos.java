package com.examprep.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import jakarta.validation.constraints.*;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

public final class AdminDiscountDtos {
    private AdminDiscountDtos() {}

    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record DiscountItem(
            Long discountId,
            String code,
            String name,
            String discountType,
            BigDecimal value,
            String appliesTo,
            Integer usageLimit,
            Integer usedCount,
            Long remaining,
            Instant startAt,
            Instant expiredAt,
            Boolean isActive,
            String validity,
            Instant createdAt
    ) {}

    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record DiscountStats(
            long assignedCount,
            int usedCount,
            long unusedAssignedCount,
            long remaining
    ) {}

    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record ContestRef(
            Long contestId,
            String title,
            String status,
            Integer rankPosition
    ) {}

    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record DiscountDetail(
            Long discountId,
            String code,
            String name,
            String description,
            String discountType,
            BigDecimal value,
            BigDecimal minOrderAmount,
            BigDecimal maxDiscountAmount,
            String appliesTo,
            Integer usageLimit,
            Integer usedCount,
            Long remaining,
            Instant startAt,
            Instant expiredAt,
            Boolean isActive,
            String validity,
            DiscountStats stats,
            List<ContestRef> usedInContests,
            Instant createdAt,
            Instant updatedAt
    ) {}

    public record DiscountWriteRequest(
            @NotBlank @Size(min = 4, max = 30) @Pattern(regexp = "^[A-Za-z0-9_-]+$") String code,
            @Size(max = 255) String name,
            String description,
            @NotBlank String discountType, // PERCENT or FIXED_AMOUNT
            @NotNull @DecimalMin("0.01") BigDecimal value,
            @DecimalMin("0.01") BigDecimal maxDiscountAmount,
            @DecimalMin("0.00") BigDecimal minOrderAmount,
            @NotBlank String appliesTo, // COURSE, SUBSCRIPTION, ALL
            @NotNull @Min(1) Integer usageLimit,
            Instant startAt,
            Instant expiredAt,
            @NotNull Boolean isActive
    ) {}

    public record StatusUpdateRequest(
            @NotNull Boolean isActive
    ) {}

    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record AffectedContest(
            Long contestId,
            String title,
            String status
    ) {}

    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record StatusUpdateResponse(
            Long discountId,
            Boolean isActive,
            List<AffectedContest> affectedContests
    ) {}

    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record UserRef(
            Long userId,
            String fullName,
            String email
    ) {}

    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record SourceRef(
            String type,
            Long id,
            String title
    ) {}

    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record AssignmentItem(
            Long userDiscountId,
            UserRef user,
            Boolean isUsed,
            Instant assignedAt,
            Instant usedAt,
            SourceRef source
    ) {}
}
