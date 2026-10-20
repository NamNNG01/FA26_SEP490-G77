-- Flyway callback (runs before every migrate, not versioned): V10 needs pg_trgm for idx_q_content_trgm
-- and no versioned script creates it. Supabase has it already; fresh databases do not.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
