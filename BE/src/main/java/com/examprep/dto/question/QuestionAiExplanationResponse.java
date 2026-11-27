package com.examprep.dto.question;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class QuestionAiExplanationResponse {
    private Long jobId;
    private int queuedCount;
    private int skippedCount;
}
