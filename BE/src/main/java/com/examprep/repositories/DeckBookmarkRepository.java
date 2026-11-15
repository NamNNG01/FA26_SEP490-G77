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
     * Kiểm tra xem deck có được bookmark bởi user không
     */
    boolean existsByDeck_DeckIdAndUser_UserId(Long deckId, Long userId);

    /**
     * Lấy bookmark nếu tồn tại
     */
    Optional<DeckBookmark> findByDeck_DeckIdAndUser_UserId(Long deckId, Long userId);

    /**
     * Xóa bookmark
     */
    void deleteByDeck_DeckIdAndUser_UserId(Long deckId, Long userId);

    /**
     * Lấy danh sách bookmarked decks của user
     * Chỉ lấy APPROVED decks hoặc decks của user
     */
    @Query("SELECT db FROM DeckBookmark db " +
            "WHERE db.user.userId = :userId " +
            "AND (db.deck.reviewStatus = 'APPROVED' OR db.deck.user.userId = :userId) " +
            "ORDER BY db.createdAt DESC")
    Page<DeckBookmark> findBookmarkedDecks(@Param("userId") Long userId, Pageable pageable);

    /**
     * Đếm số bookmarks của một deck
     */
    long countByDeck_DeckId(Long deckId);
}
