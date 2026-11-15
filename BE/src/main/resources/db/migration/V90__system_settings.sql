-- V90__system_settings.sql
-- Persistence for the admin System Settings screen. V1 created a system_settings table and V4
-- dropped it as dead code; the screen saved nothing and silently reverted on reload, so this is
-- the single-document replacement: one JSON object per key, written and returned verbatim.
CREATE TABLE IF NOT EXISTS system_settings (
    setting_key   VARCHAR(100) PRIMARY KEY,
    setting_value JSONB        NOT NULL,
    updated_at    TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_by    BIGINT       REFERENCES users(user_id) ON DELETE SET NULL
);
