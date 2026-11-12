package com.examprep.dto.student;

import java.time.Instant;
import java.util.List;

/** Response bodies of CD-03 … CD-07 (spec 19.1 … 19.5). */
public final class CodeExamResponses {
    private CodeExamResponses() {}

    /** CD-03: no hidden fixture and no answer ever leaves the server. */
    public record QuestionItem(Long questionId, Integer orderIndex, String content,
                               List<String> languages, String codeTemplate,
                               String sampleInput, String sampleOutput) {}

    public record Questions(Long examId, String title, Integer durationMinutes,
                            List<QuestionItem> questions) {}

    /** CD-04 */
    public record RunResult(String status, String stdout, String stderr, Integer executionTimeMs) {}

    /** CD-05: {@code failedTestCase} is the 1-based index of the first failing fixture. */
    public record CaseResult(Long questionId, String status, int testCasesPassed,
                             int testCasesTotal, Integer failedTestCase) {}

    public record Submitted(List<CaseResult> results) {}

    /** CD-06 */
    public record Language(String id, String name) {}

    /**
     * CD-07: one judged fixture with its input and the program's own output; the expected output
     * only comes with a passed fixture, so a failing student can't copy the answer.
     */
    public record TestCaseOutcome(Long testCaseId, Integer orderIndex, boolean hidden, boolean passed,
                                  String inputData, String expectedOutput, String actualOutput) {}

    /** CD-07 */
    public record SubmissionItem(Long submissionId, Long questionId, String language, String status,
                                 Integer testCasesPassed, Integer testCasesTotal,
                                 List<TestCaseOutcome> testCases, Instant createdAt) {}
}
