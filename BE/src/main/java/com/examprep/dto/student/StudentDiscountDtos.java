package com.examprep.dto.student;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.Instant;

public class StudentDiscountDtos {

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class StudentDiscountItemDto {
        private Long userDiscountId;
        private Long discountId;
        private String code;
        private String name;
        private String description;
        private String discountType;
        private BigDecimal value;
        private Instant startAt;
        private Instant expiresAt;
        private String appliesTo;
        private BigDecimal minOrderAmount;
        private BigDecimal maxDiscountAmount;
        private String status; // AVAILABLE, USED, EXPIRED, REVOKED
        private Instant assignedAt;
        private Instant usedAt;
        private String sourceType;
        private Long sourceId;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class StudentDiscountDetailDto {
        private Long userDiscountId;
        private Long discountId;
        private String code;
        private String name;
        private String description;
        private String discountType;
        private BigDecimal value;
        private Instant startAt;
        private Instant expiresAt;
        private String appliesTo;
        private BigDecimal minOrderAmount;
        private BigDecimal maxDiscountAmount;
        private String status; // AVAILABLE, USED, EXPIRED, REVOKED
        private Instant assignedAt;
        private Instant usedAt;
        private String sourceType;
        private Long sourceId;
        private ContestSourceInfo contestInfo;
    }

    @Data
    @AllArgsConstructor
    @NoArgsConstructor
    public static class ContestSourceInfo {
        private Long contestId;
        private String title;
        private Instant startTime;
        private Instant endTime;
    }
}
