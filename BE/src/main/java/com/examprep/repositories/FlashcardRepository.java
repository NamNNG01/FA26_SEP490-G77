package com.examprep.repositories;

import com.examprep.entities.Flashcard;
import com.examprep.dto.IdCount;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import java.util.List;
import java.util.Optional;

@Repository
public interface FlashcardRepository extends JpaRepository<Flashcard, Long> {
    List<Flashcard> findByDeckDeckIdOrderByCardIdAsc(Long deckId);

    // F-06..F-08: load a card with the ownership chain needed for the deck
    // permission check (deck -> course -> manager) without lazy round trips.
    @EntityGraph(attributePaths = {"deck", "deck.course", "deck.user"})
    @Query("SELECT f FROM Flashcard f WHERE f.cardId = :id")
    Optional<Flashcard> findDetail(@Param("id") Long id);

    @Query("SELECT new com.examprep.dto.IdCount(f.deck.deckId, COUNT(f)) FROM Flashcard f " +
            "WHERE f.deck.deckId IN :ids GROUP BY f.deck.deckId")
    List<IdCount> countByDecks(@Param("ids") List<Long> ids);

    @Modifying
    @Query("DELETE FROM Flashcard f WHERE f.deck.deckId = :deckId")
    void deleteByDeck(@Param("deckId") Long deckId);

    @Query("SELECT new com.examprep.dto.student.CardDto(" +
            "f.cardId, f.frontText, f.backText, " +
            "COALESCE(p.status, 'NEW'), " +
            "COALESCE(p.isStarred, false)) " +
            "FROM Flashcard f LEFT JOIN UserCardProgress p ON p.card = f AND p.user.userId = :userId " +
            "WHERE f.deck.deckId = :deckId")
    Page<com.examprep.dto.student.CardDto> findDeckCardsWithProgress(@Param("deckId") Long deckId, @Param("userId") Long userId, Pageable pageable);

    long countByDeckDeckId(Long deckId);

    @Query("SELECT COALESCE(MAX(f.position), 0) FROM Flashcard f WHERE f.deck.deckId = :deckId")
    int maxPosition(@Param("deckId") Long deckId);

    List<Flashcard> findByDeckDeckIdOrderByPositionAscCardIdAsc(Long deckId);

    Optional<Flashcard> findFirstByDeckDeckIdAndSourceQuestionId(Long deckId, Long sourceQuestionId);
}
