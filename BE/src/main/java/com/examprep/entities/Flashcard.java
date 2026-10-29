package com.examprep.entities;

import jakarta.persistence.*;
import lombok.*;

import java.io.Serializable;

@Entity
@Table(name = "flashcards")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Flashcard implements Serializable {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "card_id")
    private Long cardId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "deck_id", nullable = false)
    private Deck deck;

    @Column(name = "front_text", nullable = false)
    private String frontText;

    @Column(name = "back_text", nullable = false)
    private String backText;

    /** 1-based order inside the deck (FC-04). */
    @Builder.Default
    @Column(name = "position", nullable = false)
    private Integer position = 0;

    /** JAVA, PYTHON, C or CPP for code decks. */
    @Column(name = "code_language", length = 30)
    private String codeLanguage;

    @Column(name = "code_body")
    private String codeBody;

    /** FC-12: the question and attempt this card was saved from. */
    @Column(name = "source_question_id")
    private Long sourceQuestionId;

    @Column(name = "source_attempt_id")
    private Long sourceAttemptId;

    @org.hibernate.annotations.CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private java.time.Instant createdAt;
}
