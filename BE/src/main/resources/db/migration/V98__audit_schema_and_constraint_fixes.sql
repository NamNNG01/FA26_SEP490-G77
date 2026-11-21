-- V98__audit_schema_and_constraint_fixes.sql
-- Additive schema alignment & constraint fixes from full audit (2026-11-21).

-- 1. P0-08: Allow STUDENT_CONTRIBUTION in questions.source and normalize any legacy 'ACCEPTED' approval_status.
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN
        SELECT DISTINCT c.conname
        FROM pg_constraint c
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
        WHERE c.conrelid = 'questions'::regclass
          AND c.contype = 'c'
          AND a.attname = 'source'
    LOOP
        EXECUTE format('ALTER TABLE questions DROP CONSTRAINT %I', r.conname);
    END LOOP;
END $$;

ALTER TABLE questions
    DROP CONSTRAINT IF EXISTS chk_questions_source,
    ADD CONSTRAINT chk_questions_source
        CHECK (source IN ('MANUAL', 'AI', 'IMPORT', 'STUDENT_CONTRIBUTION'));

UPDATE questions
SET approval_status = 'APPROVED'
WHERE approval_status = 'ACCEPTED';

-- 2. P0-09 & P1-20: Allow NULL discounts."value" (for PERCENT discounts) and allow reusing soft-deleted codes.
ALTER TABLE discounts
    ALTER COLUMN "value" DROP NOT NULL,
    DROP CONSTRAINT IF EXISTS discounts_code_key;

-- 3. P1-10: Widen score columns from NUMERIC(5,2) / NUMERIC(6,2) to NUMERIC(8,2) so exams up to max_score=10000 never overflow.
ALTER TABLE exams
    ALTER COLUMN max_score TYPE NUMERIC(8,2);

ALTER TABLE exam_attempts
    ALTER COLUMN total_score TYPE NUMERIC(8,2);

ALTER TABLE attempt_answers
    ALTER COLUMN score_earned TYPE NUMERIC(8,2);

ALTER TABLE contest_participants
    ALTER COLUMN score TYPE NUMERIC(8,2);

ALTER TABLE answer_regrade_logs
    ALTER COLUMN old_score TYPE NUMERIC(8,2),
    ALTER COLUMN new_score TYPE NUMERIC(8,2);

-- 4. A4 (DEF-BF06-02): Persist optional passing criteria (pass_mark) on exams.
ALTER TABLE exams
    ADD COLUMN IF NOT EXISTS pass_mark NUMERIC(8,2);

ALTER TABLE exams
    DROP CONSTRAINT IF EXISTS chk_exams_pass_mark,
    ADD CONSTRAINT chk_exams_pass_mark
        CHECK (pass_mark IS NULL OR (pass_mark >= 0 AND pass_mark <= max_score));

-- 5. P0-12: Backfill visibility for existing manager/admin public decks.
UPDATE decks d
SET visibility = 'PUBLIC'
FROM users u
WHERE d.user_id = u.user_id
  AND u.role_name <> 'STUDENT'
  AND d.is_public = TRUE
  AND d.visibility = 'PRIVATE';
