-- =====================================================================
-- UM (User Management): track last successful login per user.
-- Additive and idempotent so it can be applied safely on any environment.
-- =====================================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP;
