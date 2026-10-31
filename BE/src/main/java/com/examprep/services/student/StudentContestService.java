package com.examprep.services.student;

import com.examprep.dto.PageResponse;
import com.examprep.dto.student.*;
import org.springframework.data.domain.Page;

import java.time.Instant;
import java.util.Map;

public interface StudentContestService {
    Page<ContestItemDto> listContests(String status, Long courseId, Instant from, Instant to, int page, int size, Long userId);
    Map<String, Object> registerContest(Long contestId, Long userId);
    ContestStartResponseDto startContest(Long contestId, Long userId);
    Map<String, Object> getLeaderboard(Long contestId, Long userId);
    ContestResultDto getContestResult(Long contestId, Long userId);
    Page<ContestHistoryItemDto> listContestHistory(Long courseId, Instant from, Instant to, int page, int size, Long userId);
    ClaimRewardResponseDto claimReward(Long contestId, Long rewardId, Long userId);
}
