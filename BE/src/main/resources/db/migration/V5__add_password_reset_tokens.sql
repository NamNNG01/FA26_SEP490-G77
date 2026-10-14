-- V5__add_password_reset_tokens.sql
-- Re-introduce password_reset_tokens (dropped in V4) to support
-- AUTH-06 (forgot password) and AUTH-07 (reset password).
-- Email delivery (SMTP) is still deferred; the API persists the hashed
-- token and returns a uniform response (see AuthServiceImpl).

CREATE TABLE IF NOT EXISTS password_reset_tokens (
    reset_token_id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    used_at TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_hash ON password_reset_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user ON password_reset_tokens(user_id);
