package com.examprep.dto.student;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ContestDetailDto {
    private Long contestId;
    private String title;
    private String description;
    private String bannerUrl;
    private Instant startTime;
    private Instant endTime;
    private int durationMinutes;
    private int questionCount;
    private Integer maxParticipants;
    private long registeredCount;
    private String status; // UPCOMING, ONGOING, ENDED, REWARDED, CANCELLED
    private CourseRef course;
    private List<RewardItem> rewards;

    // Student specific info
    @JsonProperty("isRegistered")
    private boolean isRegistered;
    private String participationStatus; // REGISTERED, IN_PROGRESS, FINISHED
    @JsonProperty("hasStarted")
    private boolean hasStarted;
    @JsonProperty("hasSubmitted")
    private boolean hasSubmitted;
    private BigDecimal score;
    private Integer rank;
    private StudentRewardInfo rewardInfo;

    @Data
    @AllArgsConstructor
    @NoArgsConstructor
    public static class CourseRef {
        private Long courseId;
        private String title;
    }

    @Data
    @AllArgsConstructor
    @NoArgsConstructor
    public static class RewardItem {
        private Integer rankPosition;
        private String discountCode;
        private String discountType;
        private BigDecimal value;
        private String name;
    }

    @Data
    @AllArgsConstructor
    @NoArgsConstructor
    public static class StudentRewardInfo {
        private Long rewardId;
        private String rewardType;
        private String valueText;
        private String name;
        private boolean claimed;
        private Integer rankPosition;
        private boolean claimable;
    }
}
