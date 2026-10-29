package com.examprep.entities;

import jakarta.persistence.*;
import lombok.*;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.io.Serializable;
import java.time.Instant;

@Entity
@Table(name = "question_review", uniqueConstraints = @UniqueConstraint(columnNames = {"student_id", "question_id"}))
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
@EntityListeners(AuditingEntityListener.class)
public class StudentQuestionReview implements Serializable {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "review_id")
    private Long reviewId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "student_id", nullable = false)
    private User student;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "question_id", nullable = false)
    private Question question;

    @Column(name = "status", nullable = false, length = 30)
    private String status; // WRONG_BOOKMARKED, ANSWERED_BOOKMARKED

    @Column(name = "bookmark", nullable = false)
    private Boolean bookmark;

    @Column(name = "wrong_count", nullable = false)
    private Integer wrongCount;

    @Column(name = "last_wrong_choice", length = 50)
    private String lastWrongChoice;

    @CreatedDate
    @Column(name = "first_wrong_at", nullable = false, updatable = false)
    private Instant firstWrongAt;

    @Column(name = "last_practiced_at", nullable = false)
    private Instant lastPracticedAt;
}
