-- V6__iteration1_api_support.sql
-- Iteration 1 API support (additive only, never edits V1-V5).
-- Idempotent guards everywhere so Flyway applies cleanly on fresh
-- Supabase PostgreSQL as well as existing dev databases.
--
-- Decisions (see docs/api-iteration-1.md §11):
--   - exams.pass_mark / max_attempts are real columns (FE ExamForm sends them).
--   - contest_reward (singular) is renamed to contest_rewards (RULES.md §2.1:
--     tables are lower_snake_case plural).
--   - MULTI_CHOICE answers get a join table attempt_answer_options, because
--     attempt_answers.selected_option_id holds a single option only.
--   - Code questions keep test cases inside questions.question_metadata JSON
--     for Iteration 1; a dedicated code_testcases table is deferred to the
--     coding-exam sprint (Iteration 3).

-- =====================================================================
-- 1. EXAMS: pass_mark + max_attempts (E-02 needs them persisted)
-- =====================================================================

ALTER TABLE exams ADD COLUMN IF NOT EXISTS pass_mark INT NOT NULL DEFAULT 50;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS max_attempts INT NOT NULL DEFAULT 1;

-- =====================================================================
-- 2. EXAMS: enforce created_by NOT NULL once data allows it
-- (V4 left the column nullable on fresh DBs with no users yet; the
--  JPA entity maps it nullable = false, so align the schema when safe.)
-- =====================================================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM exams WHERE created_by IS NULL) THEN
        ALTER TABLE exams ALTER COLUMN created_by SET NOT NULL;
    END IF;
END $$;

-- =====================================================================
-- 3. CONTEST_REWARD (singular) -> CONTEST_REWARDS (plural per RULES §2.1)
-- =====================================================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'contest_reward')
       AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'contest_rewards') THEN
        ALTER TABLE contest_reward RENAME TO contest_rewards;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS contest_rewards (
    reward_id BIGSERIAL PRIMARY KEY,
    contest_id BIGINT NOT NULL REFERENCES contests(contest_id) ON DELETE CASCADE,
    discount_id BIGINT NOT NULL REFERENCES discounts(discount_id) ON DELETE RESTRICT,
    rank_position INT NOT NULL
);

-- Keep the index name consistent with the new table name (old name keeps
-- working even without this, index names are independent of the table).
--
-- Index names share one namespace per schema, so a RENAME fails with
-- "relation already exists" when the new name is taken. Cases handled:
--   old only     -> rename old to new
--   new only     -> nothing to rename
--   both         -> keep new; drop old only if it is a duplicate on
--                   contest_rewards, otherwise leave it on the legacy
--                   contest_reward table untouched
--   neither      -> CREATE INDEX IF NOT EXISTS below builds it
-- to_regclass() resolves via search_path (no cross-schema false hits on
-- Supabase) and returns NULL instead of raising when the name is absent.
DO $$
DECLARE
    old_idx regclass := to_regclass('idx_contest_reward_contest');
    new_idx regclass := to_regclass('idx_contest_rewards_contest');
BEGIN
    IF old_idx IS NOT NULL AND new_idx IS NULL THEN
        ALTER INDEX idx_contest_reward_contest RENAME TO idx_contest_rewards_contest;
    ELSIF old_idx IS NOT NULL AND new_idx IS NOT NULL THEN
        IF EXISTS (SELECT 1 FROM pg_index
                   WHERE indexrelid = old_idx
                     AND indrelid = to_regclass('contest_rewards')) THEN
            DROP INDEX idx_contest_reward_contest;
        ELSE
            RAISE NOTICE 'V6: idx_contest_reward_contest kept on legacy table contest_reward';
        END IF;
    END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_contest_rewards_contest ON contest_rewards(contest_id);

-- =====================================================================
-- 4. ATTEMPT_ANSWER_OPTIONS: multi-select answers for MULTI_CHOICE
-- (attempt_answers.selected_option_id stores ONE option only.)
-- =====================================================================

CREATE TABLE IF NOT EXISTS attempt_answer_options (
    attempt_answer_option_id BIGSERIAL PRIMARY KEY,
    attempt_answer_id BIGINT NOT NULL REFERENCES attempt_answers(attempt_answer_id) ON DELETE CASCADE,
    option_id BIGINT NOT NULL REFERENCES answer_options(option_id) ON DELETE CASCADE,
    UNIQUE (attempt_answer_id, option_id)
);
CREATE INDEX IF NOT EXISTS idx_attempt_answer_options_answer ON attempt_answer_options(attempt_answer_id);
CREATE INDEX IF NOT EXISTS idx_attempt_answer_options_option ON attempt_answer_options(option_id);

-- =====================================================================
-- 5. EXAM_QUESTIONS / EXAM_GROUPS: guard against duplicate attaches
-- (BE also checks in the service layer; the DB is the final backstop.
--  Wrapped so pre-existing duplicates never fail a migration run —
--  clean them manually before re-running if the notice appears.)
-- =====================================================================

DO $$
BEGIN
    BEGIN
        CREATE UNIQUE INDEX IF NOT EXISTS uq_exam_questions_exam_question
            ON exam_questions(exam_id, question_id);
    EXCEPTION WHEN unique_violation THEN
        RAISE NOTICE 'V6: duplicate rows in exam_questions, unique index skipped';
    END;
    BEGIN
        CREATE UNIQUE INDEX IF NOT EXISTS uq_exam_groups_exam_group
            ON exam_groups(exam_id, group_id);
    EXCEPTION WHEN unique_violation THEN
        RAISE NOTICE 'V6: duplicate rows in exam_groups, unique index skipped';
    END;
END $$;

-- =====================================================================
-- 6. OPTIONAL (Iteration 2): decks.description for the FE deck editor
-- Uncomment when the flashcard UI needs a deck description field.
-- =====================================================================

-- ALTER TABLE decks ADD COLUMN IF NOT EXISTS description TEXT;
