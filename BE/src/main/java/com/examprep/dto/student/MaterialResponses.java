package com.examprep.dto.student;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

/** Response bodies of MQ-01 … MQ-06 (spec 13.1 … 13.6). */
public final class MaterialResponses {
    private MaterialResponses() {}

    /** A course a material is attached to. */
    public record CourseLink(Long courseId, String title) {}

    /** MQ-01: {@code duplicate} means the file was already stored and only the course was linked. */
    public record Uploaded(Long documentId, String fileName, Integer pageCount, String title,
                           Boolean duplicate, List<Long> courseIds) {}

    public record JobBrief(Long jobId, Integer questionCount, String status, Long courseId) {}

    /** MQ-02 */
    public record DocumentItem(Long documentId, String title, String fileName, Integer pageCount,
                               Instant uploadedAt, List<JobBrief> jobs, List<CourseLink> courses) {}

    /** MQ-03 (202) */
    public record JobAccepted(Long jobId, String status, Integer questionCount) {}

    /** MQ-04 */
    public record JobState(Long jobId, String status, Integer progress, Integer questionCount,
                           String errorMessage, Long quizId) {}

    /** GET /lookup and POST /{documentId}/courses. */
    public record Lookup(Long documentId, String title, String fileName, List<CourseLink> courses) {}

    /** MQ-05: options never carry the correct flag. */
    public record StartedOption(Long optionId, String optionText) {}

    public record StartedQuestion(Long questionId, Integer orderIndex, String questionType,
                                  String content, List<StartedOption> options) {}

    public record Started(Long attemptId, List<StartedQuestion> questions) {}

    /** MQ-06 */
    public record HistoryItem(Long jobId, Long documentId, String documentTitle, Integer questionCount,
                              BigDecimal bestScore, Integer attemptCount, Instant createdAt,
                              Long quizId, Long courseId) {}
}
