-- V88__bookmark_deck_and_copy_features.sql
-- 1. Bảng lưu bookmarks của học sinh cho deck
CREATE TABLE IF NOT EXISTS deck_bookmarks (
    bookmark_id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    deck_id BIGINT NOT NULL REFERENCES decks(deck_id) ON DELETE CASCADE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, deck_id)
);

-- Index để tìm kiếm nhanh bookmarks của một user
CREATE INDEX IF NOT EXISTS idx_deck_bookmarks_user ON deck_bookmarks(user_id, created_at DESC);
-- Index để kiểm tra xem một deck có được bookmark không
CREATE INDEX IF NOT EXISTS idx_deck_bookmarks_deck ON deck_bookmarks(deck_id);
