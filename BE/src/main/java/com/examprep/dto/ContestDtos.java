package com.examprep.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

/** Course manager contest APIs 1-12 (Deadline 2 section 3). Null fields are always written (section 1.4). */
public final class ContestDtos {
    private ContestDtos() {}

    /** API 3 / API 4 body; validated in the service so errors carry field names in the spec's shape. */
    public record ContestWrite(String title, String description, Long examId, Instant startTime, Instant endTime,
                               List<RewardWrite> rewards) {}

    public record RewardWrite(Integer rankPosition, Long discountId) {}

    public record CancelRequest(String reason) {}

    public record BatchPayRequest(List<Long> contestIds) {}

    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record CourseRef(Long courseId, String title) {}

    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record ExamRef(Long examId, String title) {}

    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record ExamInfo(Long examId, String title, Integer durationMinutes, BigDecimal maxScore, long questionCount) {}

    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record UserRef(Long userId, String fullName) {}

    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record DiscountInfo(Long discountId, String code, String name, String discountType, BigDecimal value, Boolean isActive,
                               String validity) {}

    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record Winner(Long userId, String fullName, BigDecimal score) {}

    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record RewardView(Long rewardId, Integer rankPosition, DiscountInfo discount, Winner winner, boolean granted) {}

    /** One reason a reward cannot be granted; required/remaining only for DISCOUNT_QUOTA_NOT_ENOUGH. */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Issue(Integer rankPosition, Long discountId, String code, String reason, Long required, Long remaining) {}

    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record ListItem(Long contestId, String title, CourseRef course, ExamRef exam, Instant startTime, Instant endTime,
                           String status, String storedStatus, String rankingStatus, long participantCount, long topN,
                           boolean canPayReward, Instant rewardedAt, Instant createdAt) {}

    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record Detail(Long contestId, String title, String description, String status, String storedStatus, String rankingStatus,
                         Instant startTime, Instant endTime, CourseRef course, ExamInfo exam, List<RewardView> rewards, long topN,
                         long participantCount, Instant rankedAt, Instant rewardedAt, UserRef rewardedBy, Instant cancelledAt,
                         String cancelReason, List<Issue> payBlockers, boolean canEdit, boolean canPublish, boolean canCancel,
                         boolean canPayReward) {}

    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record LeaderboardUser(Long userId, String fullName, String avatarUrl) {}

    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record PlannedReward(Long discountId, String code, String discountType, BigDecimal value) {}

    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record LeaderboardRow(Integer rank, LeaderboardUser user, BigDecimal score, Integer timeSpentSeconds, Instant submittedAt,
                                 PlannedReward reward, boolean rewardGranted, Instant rewardGrantedAt) {}

    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record WinnerDiscount(Long discountId, String code) {}

    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record PaidWinner(int rank, Long userId, String fullName, WinnerDiscount discount) {}

    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record PayResult(Long contestId, String status, Instant rewardedAt, int rewardsGranted, List<PaidWinner> winners) {}

    /** One row of API 10; success rows carry status/rewardsGranted/rewardedAt, failed rows errorCode/message/issues. */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record BatchRow(Long contestId, String title, boolean success, String status, Integer rewardsGranted, Instant rewardedAt,
                           String errorCode, String message, List<Issue> issues) {}

    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record BatchResult(int total, int succeeded, int failed, List<BatchRow> results) {}

    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record ExamOption(Long examId, String title, Long courseId, Integer durationMinutes, BigDecimal maxScore, long questionCount,
                             boolean hasEssayQuestions, Instant publishedAt) {}

    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record DiscountOption(Long discountId, String code, String name, String discountType, BigDecimal value, long remaining,
                                 Instant expiredAt) {}
}
