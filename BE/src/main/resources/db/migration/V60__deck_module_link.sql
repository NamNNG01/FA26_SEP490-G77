-- V60__deck_module_link.sql
-- A course deck can belong to one module of its course, so the course detail (CL-02) can count the
-- flashcard decks of each module. Optional: decks without a module still count for the whole course.
ALTER TABLE decks ADD COLUMN IF NOT EXISTS module_id BIGINT REFERENCES modules(module_id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_decks_module ON decks(module_id);
