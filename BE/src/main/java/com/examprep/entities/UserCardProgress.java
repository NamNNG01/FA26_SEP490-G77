package com.examprep.entities;

import jakarta.persistence.*;
import lombok.*;

import java.io.Serializable;

@Entity
@Table(name = "user_card_progress",
        uniqueConstraints = @UniqueConstraint(columnNames = {"user_id", "card_id"}))
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class UserCardProgress implements Serializable {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "progress_id")
    private Long progressId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "card_id", nullable = false)
    private Flashcard card;

    @Column(name = "is_starred", nullable = false)
    private Boolean isStarred;

    @Column(name = "status", nullable = false, length = 30)
    private String status;

    /** Times the student marked the card "review again" (spec 9.2). */
    @Builder.Default
    @Column(name = "wrong_count", nullable = false)
    private Integer wrongCount = 0;

    @Column(name = "last_reviewed_at")
    private java.time.Instant lastReviewedAt;
}
