-- V65__google_oauth_login.sql
-- AUTH-09 Google Sign-In.
--
-- NOTE ON THE VERSION NUMBER: this file was authored as V64, but the shared
-- Supabase schema already recorded a version 64 ("student performance indexes")
-- on 2026-10-31 before this migration existed. Flyway validates the description
-- and checksum of every applied version, so two different V64s would make the
-- backend refuse to start everywhere. Renumbered to V65 rather than rewriting
-- an applied version's history.

-- A Google account authenticates against Google, so the row it owns on first
-- sign-in has no password of its own. Existing password accounts keep their
-- hash untouched; only Google-only rows store NULL. AUTH-02 stays safe because
-- BCryptPasswordEncoder.matches() answers false for an empty encoded password.
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

-- Google's stable subject identifier ("sub"). Nullable: every account that
-- does not use Google Sign-In has none.
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id VARCHAR(255);

-- Partial unique index: NULL rows (all password-only accounts) are excluded,
-- so the constraint only applies to accounts actually linked to Google.
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_google_id
    ON users (google_id)
    WHERE google_id IS NOT NULL;
