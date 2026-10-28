-- V44__contest_manual_reward.sql
-- Contest manual reward & discount tracking enhancements

-- 1. contests: add columns
ALTER TABLE contests ADD COLUMN IF NOT EXISTS course_id BIGINT;
ALTER TABLE contests ADD COLUMN IF NOT EXISTS created_by BIGINT;
ALTER TABLE contests ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
ALTER TABLE contests ADD COLUMN IF NOT EXISTS ranked_at TIMESTAMP;
ALTER TABLE contests ADD COLUMN IF NOT EXISTS rewarded_at TIMESTAMP;
ALTER TABLE contests ADD COLUMN IF NOT EXISTS rewarded_by BIGINT;
ALTER TABLE contests ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP;
ALTER TABLE contests ADD COLUMN IF NOT EXISTS cancel_reason TEXT;

-- Backfill course_id and created_by from exams
UPDATE contests c
SET course_id = e.course_id,
    created_by = e.created_by
FROM exams e
WHERE c.exam_id = e.exam_id
  AND (c.course_id IS NULL OR c.created_by IS NULL);

-- Backfill end_time if null: start_time + duration_minutes
UPDATE contests
SET end_time = start_time + (duration_minutes || ' minutes')::interval
WHERE end_time IS NULL AND start_time IS NOT NULL AND duration_minutes IS NOT NULL;

-- Optional NOT NULL if no nulls remain
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM contests WHERE end_time IS NULL) THEN
        ALTER TABLE contests ALTER COLUMN end_time SET NOT NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM contests WHERE course_id IS NULL) THEN
        ALTER TABLE contests ALTER COLUMN course_id SET NOT NULL;
    END IF;
END $$;

-- Foreign Keys for contests
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_contests_course') THEN
        ALTER TABLE contests ADD CONSTRAINT fk_contests_course FOREIGN KEY (course_id) REFERENCES courses(course_id) ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_contests_created_by') THEN
        ALTER TABLE contests ADD CONSTRAINT fk_contests_created_by FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_contests_rewarded_by') THEN
        ALTER TABLE contests ADD CONSTRAINT fk_contests_rewarded_by FOREIGN KEY (rewarded_by) REFERENCES users(user_id) ON DELETE SET NULL;
    END IF;
END $$;

-- Indexes for contests
CREATE INDEX IF NOT EXISTS idx_contests_course_status ON contests(course_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_contests_exam_active ON contests(exam_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_contests_course_endtime ON contests(course_id, end_time) WHERE status = 'PUBLISHED' AND deleted_at IS NULL;


-- 2. contest_participants: add reward_user_discount_id
ALTER TABLE contest_participants ADD COLUMN IF NOT EXISTS reward_user_discount_id BIGINT;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_cp_user_discount') THEN
        ALTER TABLE contest_participants ADD CONSTRAINT fk_cp_user_discount FOREIGN KEY (reward_user_discount_id) REFERENCES user_discounts(user_discount_id) ON DELETE SET NULL;
    END IF;
END $$;

-- Ensure UNIQUE (contest_id, user_id)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
        WHERE tc.table_name = 'contest_participants' AND tc.constraint_type = 'UNIQUE'
    ) THEN
        IF EXISTS (SELECT contest_id, user_id FROM contest_participants GROUP BY contest_id, user_id HAVING count(*) > 1) THEN
            RAISE EXCEPTION 'Duplicate records found in contest_participants for (contest_id, user_id)';
        END IF;
        ALTER TABLE contest_participants ADD CONSTRAINT uq_contest_participant UNIQUE (contest_id, user_id);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_cp_contest_rank ON contest_participants(contest_id, rank);


-- 3. contest_rewards: ensure unique (contest_id, rank_position)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
        WHERE tc.table_name = 'contest_rewards' AND tc.constraint_type = 'UNIQUE'
    ) THEN
        IF EXISTS (SELECT contest_id, rank_position FROM contest_rewards GROUP BY contest_id, rank_position HAVING count(*) > 1) THEN
            RAISE EXCEPTION 'Duplicate records found in contest_rewards for (contest_id, rank_position)';
        END IF;
        ALTER TABLE contest_rewards ADD CONSTRAINT uq_contest_reward_rank UNIQUE (contest_id, rank_position);
    END IF;
END $$;


-- 4. user_discounts: add source_type, source_id, used_at; replace unique constraint with partial unique indexes
ALTER TABLE user_discounts ADD COLUMN IF NOT EXISTS source_type VARCHAR(30);
ALTER TABLE user_discounts ADD COLUMN IF NOT EXISTS source_id BIGINT;
ALTER TABLE user_discounts ADD COLUMN IF NOT EXISTS used_at TIMESTAMP;

-- Drop old UNIQUE constraint on (user_id, discount_id) if exists
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT tc.constraint_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
        WHERE tc.table_name = 'user_discounts' AND tc.constraint_type = 'UNIQUE'
    LOOP
        EXECUTE format('ALTER TABLE user_discounts DROP CONSTRAINT IF EXISTS %I', r.constraint_name);
    END LOOP;
END $$;

-- Check duplicates for partial unique indexes before creating them
DO $$
BEGIN
    IF EXISTS (SELECT user_id, discount_id FROM user_discounts WHERE source_type IS NULL GROUP BY user_id, discount_id HAVING count(*) > 1) THEN
        RAISE EXCEPTION 'Duplicate records found in user_discounts where source_type IS NULL';
    END IF;
    IF EXISTS (SELECT user_id, discount_id, source_type, source_id FROM user_discounts WHERE source_type IS NOT NULL GROUP BY user_id, discount_id, source_type, source_id HAVING count(*) > 1) THEN
        RAISE EXCEPTION 'Duplicate records found in user_discounts where source_type IS NOT NULL';
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_discounts_legacy ON user_discounts(user_id, discount_id) WHERE source_type IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_discounts_sourced ON user_discounts(user_id, discount_id, source_type, source_id) WHERE source_type IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_discounts_discount_isused ON user_discounts(discount_id, is_used);
