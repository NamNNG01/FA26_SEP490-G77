package com.examprep.dto.student;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ContestResultDto {
    private Integer rank;
    private BigDecimal score;
    private long totalParticipants;
    private String certificateUrl;
    private List<RewardItemDto> rewards;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class RewardItemDto {
        private Long rewardId;
        private String rewardType;
        private String value;
        private String description;
        private boolean claimed;
        private Integer rankPosition;
        private boolean claimable;
    }
}
