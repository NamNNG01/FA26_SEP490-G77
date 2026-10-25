package com.examprep.dto;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

import java.util.List;

public final class StudentAiRequests {
    private StudentAiRequests() {}

    /** SE-01. Duplicates are allowed and reported back in duplicatesIgnored. */
    public record ExplanationBatch(
            @NotEmpty(message = "questionIds must contain 1 to 20 question ids")
            @Size(max = 20, message = "questionIds must contain 1 to 20 question ids")
            List<@NotNull(message = "questionIds must not contain null") @Positive(message = "questionIds must be positive") Long> questionIds) { }

    /** SE-02. questionIds omitted: every essay/diagram question that still needs grading. */
    public record Grading(
            @Size(min = 1, max = 10, message = "questionIds must contain 1 to 10 question ids")
            List<@NotNull(message = "questionIds must not contain null") @Positive(message = "questionIds must be positive") Long> questionIds) { }
}
