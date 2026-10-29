package com.examprep.dto.student;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ClaimRewardResponseDto {
    private Long rewardId;
    private String rewardType;
    private String value;
    private boolean claimed;
    private Instant claimedAt;
}
