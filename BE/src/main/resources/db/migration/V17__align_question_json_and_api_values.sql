-- Forward alignment on top of V9-V16 (already applied on the shared database).
-- Keeps the team's MULTIPLE_CHOICE value; V10 already converted the JSON columns to JSONB.
ALTER TABLE questions DROP CONSTRAINT IF EXISTS chk_question_type;
ALTER TABLE questions ADD CONSTRAINT chk_question_type CHECK (question_type IN (
    'SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'TRUE_FALSE', 'FILL_BLANK', 'MATCHING',
    'ORDERING', 'ESSAY', 'CODE', 'DIAGRAM'
));

-- V10 adds content_hash as CHAR(64) only if missing; the shared DB already had VARCHAR(64),
-- which is what the Question entity validates against. Make fresh databases match.
ALTER TABLE questions ALTER COLUMN content_hash TYPE VARCHAR(64);

UPDATE exams SET generation_type = 'STATIC' WHERE generation_type = 'FIXED';
ALTER TABLE exams ALTER COLUMN generation_type SET DEFAULT 'STATIC';
