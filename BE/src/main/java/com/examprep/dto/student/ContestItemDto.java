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
public class ContestItemDto {
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
    private String status; // UPCOMING, ONGOING, ENDED, CANCELLED
    @JsonProperty("isRegistered")
    private boolean isRegistered;
}
