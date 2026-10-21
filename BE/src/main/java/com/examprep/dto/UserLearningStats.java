package com.examprep.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.Instant;

/**
 * UM-02: learning statistics shown on the admin User Detail screen.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class UserLearningStats {

    private long coursesEnrolled;
    private long examsTaken;
    /** Average of scored attempts, rounded to 2 decimals; null when there are none. */
    private BigDecimal averageScore;
    /** Submit time of the most recent attempt; null when the user never submitted. */
    private Instant lastActivityAt;
}
