package com.examprep.repositories;

import com.examprep.dto.IdCount;
import com.examprep.entities.UserCardProgress;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import java.util.List;
import java.util.Optional;

@Repository
public interface UserCardProgressRepository extends JpaRepository<UserCardProgress, Long> {
    List<UserCardProgress> findByUserUserIdAndCardDeckDeckId(Long userId, Long deckId);

    @Modifying
    @Query("DELETE FROM UserCardProgress p WHERE p.card.cardId IN " +
            "(SELECT f.cardId FROM Flashcard f WHERE f.deck.deckId = :deckId)")
    void deleteByDeck(@Param("deckId") Long deckId);

    // F-08: the database also cascades this on Postgres, but Hibernate's own
    // DDL (test schema) has no ON DELETE rule, so remove progress explicitly.
    @Modifying
    @Query("DELETE FROM UserCardProgress p WHERE p.card.cardId = :cardId")
    void deleteByCard(@Param("cardId") Long cardId);

    Optional<UserCardProgress> findByUserUserIdAndCardCardId(Long userId, Long cardId);

    @Query("SELECT new com.examprep.dto.IdCount(p.card.deck.deckId, COUNT(p)) FROM UserCardProgress p " +
            "WHERE p.user.userId = :userId AND p.card.deck.deckId IN :ids AND p.status = 'KNOWN' GROUP BY p.card.deck.deckId")
    List<IdCount> countKnownByDecks(@Param("userId") Long userId, @Param("ids") List<Long> ids);

    @Query("SELECT new com.examprep.dto.IdCount(p.card.deck.deckId, COUNT(p)) FROM UserCardProgress p " +
            "WHERE p.user.userId = :userId AND p.card.deck.deckId IN :ids AND p.isStarred = true GROUP BY p.card.deck.deckId")
    List<IdCount> countStarredByDecks(@Param("userId") Long userId, @Param("ids") List<Long> ids);

    @Query("SELECT COUNT(p) FROM UserCardProgress p WHERE p.user.userId = :userId AND p.card.deck.deckId = :deckId AND p.status = 'KNOWN'")
    long countKnown(@Param("userId") Long userId, @Param("deckId") Long deckId);
}
