-- V78: Ensure module_id exists on decks table (robust fix for remote Supabase schema sync).
ALTER TABLE decks ADD COLUMN IF NOT EXISTS module_id BIGINT REFERENCES modules(module_id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_decks_module ON decks(module_id);
