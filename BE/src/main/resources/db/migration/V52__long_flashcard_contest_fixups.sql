-- V52__long_flashcard_contest_fixups.sql
-- Aligns V41-V43 with the Part 2 spec (FC/FP/PQ/AI) and the contest manager spec (Deadline 2).

-- decks.mode is the card layout (spec 14), not PERSONAL/COURSE (personal = course_id IS NULL).
ALTER TABLE decks DROP CONSTRAINT IF EXISTS chk_deck_mode;
UPDATE decks SET mode = 'FLASHCARD' WHERE mode NOT IN ('FLASHCARD', 'CODE_SNIPPET', 'CODE_OUTPUT');
ALTER TABLE decks ALTER COLUMN mode SET DEFAULT 'FLASHCARD';
ALTER TABLE decks ADD CONSTRAINT chk_deck_mode CHECK (mode IN ('FLASHCARD', 'CODE_SNIPPET', 'CODE_OUTPUT'));
ALTER TABLE decks ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMP;

-- FP-01 modes.
ALTER TABLE study_sessions DROP CONSTRAINT IF EXISTS chk_ss_mode;
UPDATE study_sessions SET mode = 'PRACTICE' WHERE mode NOT IN ('PRACTICE', 'LEARN', 'VIEWER');
ALTER TABLE study_sessions ALTER COLUMN mode SET DEFAULT 'PRACTICE';
ALTER TABLE study_sessions ADD CONSTRAINT chk_ss_mode CHECK (mode IN ('PRACTICE', 'LEARN', 'VIEWER'));

-- Generated exams (PQ-01, AI-01) are told apart from course exams by mode.
ALTER TABLE exams DROP CONSTRAINT IF EXISTS chk_exam_mode;
UPDATE exams SET mode = 'EXAM' WHERE mode IS NULL OR mode NOT IN ('EXAM', 'PRACTICE', 'SMART_PRACTICE', 'MATERIAL_QUIZ');
ALTER TABLE exams ADD CONSTRAINT chk_exam_mode CHECK (mode IN ('EXAM', 'PRACTICE', 'SMART_PRACTICE', 'MATERIAL_QUIZ'));

-- Contest reward grant time (Deadline 2 section 2).
ALTER TABLE contest_participants ADD COLUMN IF NOT EXISTS reward_granted_at TIMESTAMP;

-- jsonb like every other JSON column the application binds.
ALTER TABLE card_imports ALTER COLUMN error_rows_json TYPE jsonb USING error_rows_json::jsonb;
ALTER TABLE practice_exams ALTER COLUMN category_ids TYPE jsonb USING category_ids::jsonb;
ALTER TABLE ai_personalization_jobs ALTER COLUMN analysis_json TYPE jsonb USING analysis_json::jsonb;
ALTER TABLE ai_recommendation_cache ALTER COLUMN result_json TYPE jsonb USING result_json::jsonb;

-- FC-12 duplicate check.
CREATE INDEX IF NOT EXISTS idx_flashcards_source_per_deck
    ON flashcards(deck_id, source_question_id) WHERE source_question_id IS NOT NULL;
