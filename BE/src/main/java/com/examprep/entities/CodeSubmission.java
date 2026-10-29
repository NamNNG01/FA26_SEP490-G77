package com.examprep.entities;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.io.Serializable;
import java.time.Instant;

/** One judged submission of a code answer (spec 19.2/19.3/19.5, table from V41). */
@Entity
@Table(name = "code_submissions")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CodeSubmission implements Serializable {
    public static final String PASSED = "PASSED";
    public static final String FAILED = "FAILED";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "submission_id")
    private Long submissionId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "attempt_answer_id", nullable = false)
    private AttemptAnswer attemptAnswer;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "attempt_id", nullable = false)
    private ExamAttempt attempt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "question_id", nullable = false)
    private Question question;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(name = "language", nullable = false, length = 30)
    private String language;

    @Column(name = "source_code", nullable = false)
    private String sourceCode;

    @Column(name = "judge0_token", length = 100)
    private String judge0Token;

    @Column(name = "status", nullable = false, length = 30)
    private String status;

    @Column(name = "stdout")
    private String stdout;

    @Column(name = "stderr")
    private String stderr;

    @Column(name = "compile_output")
    private String compileOutput;

    @Column(name = "time_ms")
    private Integer timeMs;

    @Column(name = "memory_kb")
    private Integer memoryKb;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "test_results", columnDefinition = "json")
    private String testResults;

    @Column(name = "passed_count")
    private Integer passedCount;

    @Column(name = "total_count")
    private Integer totalCount;

    @Column(name = "submitted_at", nullable = false)
    private Instant submittedAt;

    @Column(name = "judged_at")
    private Instant judgedAt;
}
