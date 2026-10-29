-- V49__discussions_enhancements.sql
ALTER TABLE discussions ADD COLUMN IF NOT EXISTS tag VARCHAR(20) NOT NULL DEFAULT 'question';
ALTER TABLE discussions ADD COLUMN IF NOT EXISTS is_anonymous BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE discussions ADD COLUMN IF NOT EXISTS upvote_count INT NOT NULL DEFAULT 0;
ALTER TABLE discussions ADD COLUMN IF NOT EXISTS is_closed BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS discussion_upvotes (
    upvote_id     BIGSERIAL    PRIMARY KEY,
    discussion_id BIGINT       NOT NULL REFERENCES discussions(discussion_id) ON DELETE CASCADE,
    user_id       BIGINT       NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    created_at    TIMESTAMP    NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_discussion_upvote UNIQUE (discussion_id, user_id)
);

CREATE TABLE IF NOT EXISTS discussion_bookmarks (
    bookmark_id   BIGSERIAL    PRIMARY KEY,
    discussion_id BIGINT       NOT NULL REFERENCES discussions(discussion_id) ON DELETE CASCADE,
    user_id       BIGINT       NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    created_at    TIMESTAMP    NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_discussion_bookmark UNIQUE (discussion_id, user_id)
);

ALTER TABLE discussion_comments ADD COLUMN IF NOT EXISTS is_anonymous BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_disc_tag ON discussions(tag);
CREATE INDEX IF NOT EXISTS idx_disc_upvotes ON discussions(upvote_count DESC);
CREATE INDEX IF NOT EXISTS idx_disc_upvotes_user ON discussion_upvotes(user_id);
CREATE INDEX IF NOT EXISTS idx_disc_bookmarks_user ON discussion_bookmarks(user_id);
