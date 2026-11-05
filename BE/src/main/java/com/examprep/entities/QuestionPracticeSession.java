package com.examprep.entities;

import jakarta.persistence.*;
import lombok.*;

import java.io.Serializable;
import java.time.Instant;

/**
 * One Module Practice run of one student on one module (table {@code question_practice_sessions}).
 *
 * <p>A session keeps the frozen, randomized question list of one practice run and the counters the
 * resume/result screens read. It is never deleted when the student leaves the page: leaving leaves
 * the row {@code IN_PROGRESS} so the next start resumes it.</p>
 */
@Entity
@Table(name = "question_practice_sessions")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class QuestionPracticeSession implements Serializable {

    public static final String STATUS_IN_PROGRESS = "IN_PROGRESS";
    public static final String STATUS_COMPLETED = "COMPLETED";
    /** Reserved: nothing marks a session abandoned today (leaving must not close a session). */
    public static final String STATUS_ABANDONED = "ABANDONED";

    public static final String MODE_ALL = "ALL";
    public static final String MODE_REVIEW = "REVIEW";
    public static final String MODE_WRONG = "WRONG";
    public static final String MODE_BOOKMARKED = "BOOKMARKED";
    public static final String MODE_RANDOM = "RANDOM";
    public static final String MODE_TARGET = "TARGET";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "session_id")
    private Long sessionId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "course_id", nullable = false)
    private Course course;

    /** Null for a course's General pool: that run is scoped by its course alone. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "module_id")
    private Module module;

    @Builder.Default
    @Column(name = "mode", nullable = false, length = 30)
    private String mode = MODE_ALL;

    @Builder.Default
    @Column(name = "question_count", nullable = false)
    private Integer questionCount = 0;

    @Builder.Default
    @Column(name = "answered_count", nullable = false)
    private Integer answeredCount = 0;

    @Builder.Default
    @Column(name = "correct_count", nullable = false)
    private Integer correctCount = 0;

    @Builder.Default
    @Column(name = "status", nullable = false, length = 30)
    private String status = STATUS_IN_PROGRESS;

    @Builder.Default
    @Column(name = "started_at", nullable = false)
    private Instant startedAt = Instant.now();

    @Builder.Default
    @Column(name = "last_activity_at", nullable = false)
    private Instant lastActivityAt = Instant.now();

    @Column(name = "completed_at")
    private Instant completedAt;

    @Builder.Default
    @Column(name = "duration_seconds", nullable = false)
    private Integer durationSeconds = 0;

    public boolean isInProgress() {
        return STATUS_IN_PROGRESS.equals(status);
    }
}
