package com.examprep.entities;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.io.Serializable;
import java.time.Instant;

@Entity
@Table(name = "study_sessions")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
/** FP-01 / FP-02 flashcard study session. */
public class StudySession implements Serializable {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "session_id")
    private Long sessionId;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "deck_id", nullable = false)
    private Long deckId;

    /** PRACTICE, LEARN or VIEWER. */
    @Column(name = "mode", nullable = false, length = 20)
    private String mode;

    @Builder.Default
    @Column(name = "cards_studied", nullable = false)
    private Integer cardsStudied = 0;

    @Builder.Default
    @Column(name = "cards_correct", nullable = false)
    private Integer cardsCorrect = 0;

    @Column(name = "started_at", nullable = false)
    private Instant startedAt;

    @Column(name = "ended_at")
    private Instant endedAt;
}
