package com.examprep.entities;

import jakarta.persistence.*;
import lombok.*;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.io.Serializable;
import java.util.Set;
import java.time.Instant;

@Entity
@Table(name = "question_issue_reports")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
@EntityListeners(AuditingEntityListener.class)
public class QuestionIssueReport implements Serializable {
    public static final Set<String> SOURCES = Set.of("EXAM", "EXAM_RESULT", "PRACTICE", "NOTEBOOK", "OTHER");

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "report_id")
    private Long reportId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "issue_id", nullable = false)
    private QuestionIssue issue;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(name = "issue_type", nullable = false, length = 30)
    private String issueType;

    @Column(name = "description", nullable = false)
    private String description;

    @Column(name = "attachment_url", length = 1000)
    private String attachmentUrl;

    /** EXAM (attempt still running), EXAM_RESULT, PRACTICE, NOTEBOOK or OTHER; null for old reports. */
    @Column(name = "source", length = 20)
    private String source;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "attempt_id")
    private ExamAttempt attempt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "practice_session_id")
    private QuestionPracticeSession practiceSession;

    /** 1-based position of the question in that attempt or practice session. */
    @Column(name = "question_number")
    private Integer questionNumber;

    /** questions.lock_version when reported, to tell a report about an older version. */
    @Column(name = "question_lock_version")
    private Long questionLockVersion;

    /** JSON {@link com.examprep.dto.QuestionIssueDtos.ContextSnapshot}: the student's answer as it stood. */
    @Column(name = "context_snapshot")
    private String contextSnapshot;

    /** JSON array of option ids the student thinks are correct. */
    @Column(name = "suggested_option_ids")
    private String suggestedOptionIds;

    @Column(name = "suggested_answer")
    private String suggestedAnswer;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;
}
