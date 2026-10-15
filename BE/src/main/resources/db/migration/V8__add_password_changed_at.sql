-- V8__add_password_changed_at.sql
-- Invalidate pre-existing Access Tokens after a password reset/change
-- (AUTH-07 / AUTH-08). JwtAuthenticationFilter rejects any access token
-- issued before users.password_changed_at. Additive only, never edits V1-V7.

ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMP;
CREATE INDEX IF NOT EXISTS idx_users_password_changed_at ON users(password_changed_at);
