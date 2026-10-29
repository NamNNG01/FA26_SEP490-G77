package com.examprep.dto.student;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

/** Response bodies of MQ-01 … MQ-06 (spec 13.1 … 13.6). */
public final class MaterialResponses {
    private MaterialResponses() {}

    /** MQ-01 */
    public record Uploaded(Long documentId, String fileName, Integer pageCount, String title) {}

    public record JobBrief(Long jobId, Integer questionCount, String status) {}

    /** MQ-02 */
    public record DocumentItem(Long documentId, String title, String fileName, Integer pageCount,
                               Instant uploadedAt, List<JobBrief> jobs) {}

    /** MQ-03 (202) */
    public record JobAccepted(Long jobId, String status, Integer questionCount) {}

    /** MQ-04 */
    public record JobState(Long jobId, String status, Integer progress, Integer questionCount,
                           String errorMessage, Long quizId) {}

    /** MQ-05: options never carry the correct flag. */
    public record StartedOption(Long optionId, String optionText) {}

    public record StartedQuestion(Long questionId, Integer orderIndex, String questionType,
                                  String content, List<StartedOption> options) {}

    public record Started(Long attemptId, List<StartedQuestion> questions) {}

    /** MQ-06 */
    public record HistoryItem(Long jobId, Long documentId, String documentTitle, Integer questionCount,
                              BigDecimal bestScore, Integer attemptCount, Instant createdAt,
                              Long quizId) {}
}
