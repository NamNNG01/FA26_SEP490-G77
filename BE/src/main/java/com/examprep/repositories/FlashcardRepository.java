package com.examprep.repositories;

import com.examprep.entities.Flashcard;
import com.examprep.dto.IdCount;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import java.util.List;

@Repository
public interface FlashcardRepository extends JpaRepository<Flashcard, Long> {
    List<Flashcard> findByDeckDeckIdOrderByCardIdAsc(Long deckId);

    @Query("SELECT new com.examprep.dto.IdCount(f.deck.deckId, COUNT(f)) FROM Flashcard f " +
            "WHERE f.deck.deckId IN :ids GROUP BY f.deck.deckId")
    List<IdCount> countByDecks(@Param("ids") List<Long> ids);

    @Modifying
    @Query("DELETE FROM Flashcard f WHERE f.deck.deckId = :deckId")
    void deleteByDeck(@Param("deckId") Long deckId);
}

