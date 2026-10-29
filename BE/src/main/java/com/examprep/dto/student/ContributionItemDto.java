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
public class ContributionItemDto {
    private Long contributionId;
    private String type;
    private String status;
    private String summary;
    private Instant createdAt;
    private Instant reviewedAt;
    private Integer resubmissionCount;
}
