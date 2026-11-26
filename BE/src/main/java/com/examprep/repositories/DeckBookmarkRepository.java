package com.examprep.repositories;

import com.examprep.entities.DeckBookmark;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface DeckBookmarkRepository extends JpaRepository<DeckBookmark, Long> {

    /**
     * Check whether the deck is bookmarked by the user.
     */
    boolean existsByDeck_DeckIdAndUser_UserId(Long deckId, Long userId);

    /**
     * Get the bookmark if it exists.
     */
    Optional<DeckBookmark> findByDeck_DeckIdAndUser_UserId(Long deckId, Long userId);

    /**
     * Delete the bookmark.
     */
    void deleteByDeck_DeckIdAndUser_UserId(Long deckId, Long userId);

    /**
     * Get the list of bookmarked decks for a user.
     * Only includes APPROVED decks or decks owned by the user.
     */
    @Query("SELECT db FROM DeckBookmark db " +
            "WHERE db.user.userId = :userId " +
            "AND (db.deck.reviewStatus = 'APPROVED' OR db.deck.user.userId = :userId) " +
            "ORDER BY db.createdAt DESC")
    Page<DeckBookmark> findBookmarkedDecks(@Param("userId") Long userId, Pageable pageable);

    /**
     * Count bookmarks for a deck.
     */
    long countByDeck_DeckId(Long deckId);
}
