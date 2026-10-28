-- Triển khai cùng lúc với thay đổi service contest
-- V47__normalize_contest_status.sql

DO $$
DECLARE
    strange_count INT;
    null_count INT;
    vals TEXT;
BEGIN
    SELECT COUNT(*) INTO null_count FROM contests WHERE status IS NULL;

    SELECT COUNT(*), string_agg(DISTINCT status, ', ') INTO strange_count, vals
    FROM contests
    WHERE status NOT IN ('UPCOMING', 'ONGOING', 'ENDED', 'CANCELLED', 'DRAFT', 'PUBLISHED', 'REWARDED')
       OR status IS NULL;

    IF strange_count > 0 THEN
        RAISE EXCEPTION 'Found % contests with strange or NULL status (values: [%]). Stopping migration as required.', strange_count, vals;
    END IF;
END $$;

-- Normalize statuses:
-- 1. UPCOMING, ONGOING -> PUBLISHED
UPDATE contests
SET status = 'PUBLISHED'
WHERE status IN ('UPCOMING', 'ONGOING');

-- 2. ENDED -> REWARDED (if has >=1 reward and ALL rewards have claimed = true)
UPDATE contests c
SET status = 'REWARDED'
WHERE c.status = 'ENDED'
  AND EXISTS (SELECT 1 FROM contest_rewards cr WHERE cr.contest_id = c.contest_id)
  AND NOT EXISTS (
      SELECT 1 FROM contest_rewards cr
      WHERE cr.contest_id = c.contest_id
        AND (cr.claimed IS NULL OR cr.claimed = FALSE)
  );

-- 3. ENDED -> PUBLISHED (all other ENDED cases)
UPDATE contests
SET status = 'PUBLISHED'
WHERE status = 'ENDED';

-- Re-constraint contest status check
DO $$
BEGIN
    BEGIN
        ALTER TABLE contests DROP CONSTRAINT IF EXISTS chk_contest_status;
    EXCEPTION WHEN others THEN NULL;
    END;
END $$;

ALTER TABLE contests ADD CONSTRAINT chk_contest_status
    CHECK (status IN ('DRAFT','PUBLISHED','REWARDED','CANCELLED'));
