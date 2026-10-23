package com.examprep.dto;

import com.examprep.exceptions.BadRequestException;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonSetter;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import java.math.BigDecimal;
import java.util.List;

@Slf4j
public final class ExamRequests {
    private ExamRequests() {}

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class QuestionLink {
        @NotNull @Positive
        private Long questionId;
        @DecimalMin(value="0", inclusive=false) @DecimalMax("1000") @Digits(integer=4, fraction=2)
        private BigDecimal weight;
        @PositiveOrZero
        private Integer orderIndex;

        @JsonSetter("points")
        public void setPoints(BigDecimal points) {
            this.weight = points;
        }
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class QuestionWeight {
        @NotNull @DecimalMin(value="0", inclusive=false) @DecimalMax("1000") @Digits(integer=4, fraction=2)
        private BigDecimal weight;

        @JsonSetter("points")
        public void setPoints(BigDecimal points) {
            this.weight = points;
        }
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class GroupQuestionPoint {
        @NotNull @Positive
        private Long questionId;
        @DecimalMin(value="0", inclusive=false) @DecimalMax("1000") @Digits(integer=4, fraction=2)
        private BigDecimal weight;

        @JsonSetter("points")
        public void setPoints(BigDecimal points) {
            this.weight = points;
        }
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class GroupLink {
        @NotNull @Positive
        private Long groupId;
        @Size(max=100)
        private List<@Valid GroupQuestionPoint> questions;
        @PositiveOrZero
        private Integer orderIndex;

        @JsonSetter("points")
        public void setPoints(Object points) {
            log.warn("Deprecated group points received and ignored.");
        }
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class ImportItem {
        private int index;
        @NotNull @DecimalMin(value="0", inclusive=false) @DecimalMax("1000")
        private BigDecimal weight;

        @JsonSetter("points")
        public void setPoints(BigDecimal points) {
            this.weight = points;
        }
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Config {
        @NotBlank
        private String questionType;
        @NotNull @Min(1) @Max(500)
        private Integer numberOfQuestions;
        @Positive
        private Long moduleId;
        @Pattern(regexp="EASY|MEDIUM|HARD")
        private String difficulty;
        @DecimalMin(value="0", inclusive=false) @Digits(integer=5, fraction=2)
        private BigDecimal weightEach;

        @JsonSetter("skillTag")
        public void setSkillTag(Object skillTag) {
            throw new BadRequestException("skillTag is not supported in exam config.");
        }

        @JsonSetter("pointsEach")
        public void setPointsEach(BigDecimal pointsEach) {
            this.weightEach = pointsEach;
        }
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Create {
        @NotBlank @Size(max=255) @Pattern(regexp="(?sU).*\\S.*")
        private String title;
        private String description;
        @Positive
        private Long courseId;
        @Positive
        private Long moduleId;
        @NotNull @Min(1) @Max(600)
        private Integer durationMinutes;
        @NotNull
        private Boolean isPractice;
        @NotNull @Pattern(regexp="STATIC|RANDOM|MIXED")
        private String generationType;
        @NotNull @DecimalMin(value="0", inclusive=false) @DecimalMax("10000") @Digits(integer=5, fraction=2)
        private BigDecimal maxScore;
        @Size(max=500)
        private List<@Valid QuestionLink> questionIds;
        @Size(max=100)
        private List<@Valid Config> configs;
        @Size(max=100)
        private List<@Valid GroupLink> groupIds;

        @JsonSetter("passMark")
        public void setPassMark(Object passMark) {
            log.warn("Deprecated passMark field received and ignored.");
        }

        @JsonSetter("maxAttempts")
        public void setMaxAttempts(Object maxAttempts) {
            log.warn("Deprecated maxAttempts field received and ignored.");
        }
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Update {
        @Size(max=255) @Pattern(regexp="(?sU).*\\S.*")
        private String title;
        private String description;
        @Positive
        private Long courseId;
        @Positive
        private Long moduleId;
        @Min(1) @Max(600)
        private Integer durationMinutes;
        private Boolean isPractice;
        @Pattern(regexp="STATIC|RANDOM|MIXED")
        private String generationType;
        @DecimalMin(value="0", inclusive=false) @DecimalMax("10000") @Digits(integer=5, fraction=2)
        private BigDecimal maxScore;
        @Size(max=100)
        private List<@Valid Config> configs;

        @JsonSetter("passMark")
        public void setPassMark(Object passMark) {
            log.warn("Deprecated passMark field received and ignored.");
        }

        @JsonSetter("maxAttempts")
        public void setMaxAttempts(Object maxAttempts) {
            log.warn("Deprecated maxAttempts field received and ignored.");
        }
    }

    public record Publish(@NotNull @Pattern(regexp="DRAFT|PUBLISHED|ARCHIVED") String status) {}
    public record Criterion(@NotBlank @Size(max=255) String name,
            @NotNull @DecimalMin(value="0",inclusive=false) BigDecimal weight, String descriptors) {}
    public record Rubric(@NotEmpty @Size(max=100) List<@Valid Criterion> criteria, String notes) {}
}
