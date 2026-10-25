-- V33__exam_attempt_deadline_and_snapshot.sql

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'exam_attempts' AND column_name = 'deadline_at') THEN
        ALTER TABLE exam_attempts ADD COLUMN deadline_at TIMESTAMP;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'exam_attempts' AND column_name = 'submitted_at') THEN
        ALTER TABLE exam_attempts ADD COLUMN submitted_at TIMESTAMP;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'exam_attempts' AND column_name = 'auto_submitted') THEN
        ALTER TABLE exam_attempts ADD COLUMN auto_submitted BOOLEAN NOT NULL DEFAULT false;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'exam_attempts' AND column_name = 'exam_snapshot') THEN
        ALTER TABLE exam_attempts ADD COLUMN exam_snapshot JSONB;
    END IF;
END $$;

-- Backfill deadline_at from exams.duration_minutes
UPDATE exam_attempts ea
SET deadline_at = ea.start_time + make_interval(mins := e.duration_minutes)
FROM exams e
WHERE ea.exam_id = e.exam_id AND ea.deadline_at IS NULL;

-- If deadline_at is still null for any reason, fallback to start_time + 60 minutes
UPDATE exam_attempts
SET deadline_at = start_time + interval '60 minutes'
WHERE deadline_at IS NULL;

-- Set NOT NULL on deadline_at
ALTER TABLE exam_attempts ALTER COLUMN deadline_at SET NOT NULL;

-- Backfill submitted_at from submit_time
UPDATE exam_attempts
SET submitted_at = submit_time
WHERE submitted_at IS NULL AND submit_time IS NOT NULL;

-- Convert status
UPDATE exam_attempts
SET status = 'SUBMITTED'
WHERE submit_time IS NOT NULL AND status NOT IN ('COMPLETED', 'GRADING', 'SUBMITTED');

UPDATE exam_attempts
SET status = 'IN_PROGRESS'
WHERE submit_time IS NULL AND status NOT IN ('IN_PROGRESS');

-- Drop old status check constraint if exists (find name or drop safely)
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN SELECT constraint_name FROM information_schema.table_constraints
             WHERE table_name = 'exam_attempts' AND constraint_type = 'CHECK' AND constraint_name LIKE '%status%'
    LOOP
        EXECUTE 'ALTER TABLE exam_attempts DROP CONSTRAINT IF EXISTS ' || quote_ident(r.constraint_name);
    END LOOP;
END $$;

ALTER TABLE exam_attempts ADD CONSTRAINT chk_attempt_status CHECK (status IN ('IN_PROGRESS','SUBMITTED','GRADING','COMPLETED'));
