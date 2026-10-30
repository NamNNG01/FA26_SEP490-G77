package com.examprep.entities;

import jakarta.persistence.*;
import lombok.*;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.io.Serializable;
import java.time.Instant;

@Entity
@Table(name = "decks")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
@EntityListeners(AuditingEntityListener.class)
public class Deck implements Serializable {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "deck_id")
    private Long deckId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "course_id")
    private Course course;

    /** Optional module of {@link #course} (V60); counted per module by CL-02. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "module_id")
    private Module module;

    @Column(name = "title", nullable = false, length = 255)
    private String title;

    /**
     * Deck description shown on SRS 3.7 Flashcard Detail (V7).
     * Nullable: decks created before V7 have none.
     */
    @Column(name = "description")
    private String description;

    @Column(name = "is_public", nullable = false)
    private Boolean isPublic;

    public static final String VISIBILITY_PRIVATE = "PRIVATE";
    public static final String VISIBILITY_PUBLIC = "PUBLIC";

    /** Card layout (spec 14): FLASHCARD, CODE_SNIPPET or CODE_OUTPUT. */
    @Builder.Default
    @Column(name = "mode", nullable = false, length = 20)
    private String mode = "FLASHCARD";

    @Builder.Default
    @Column(name = "visibility", nullable = false, length = 20)
    private String visibility = VISIBILITY_PRIVATE;

    /** NONE, PENDING_REVIEW, APPROVED or REJECTED (spec 9.6). */
    @Builder.Default
    @Column(name = "review_status", nullable = false, length = 30)
    private String reviewStatus = "NONE";

    @Column(name = "review_note")
    private String reviewNote;

    @Column(name = "submitted_at")
    private Instant submittedAt;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @LastModifiedDate
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;
}
