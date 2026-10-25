-- V39__ai_grading_queue_and_error.sql
-- SE-02 / AG-W01: essay grading is queued by the student and run by a worker.
-- (V38 is taken by "student read indexes", already applied on the dev DB.)

-- 1. grading_status gains QUEUED and GRADING. V12 created the CHECK inline, so its name is generated.
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN SELECT con.conname FROM pg_constraint con
             WHERE con.conrelid = 'attempt_answers'::regclass AND con.contype = 'c'
               AND pg_get_constraintdef(con.oid) LIKE '%grading_status%'
    LOOP
        EXECUTE 'ALTER TABLE attempt_answers DROP CONSTRAINT ' || quote_ident(r.conname);
    END LOOP;
END $$;

ALTER TABLE attempt_answers ADD CONSTRAINT chk_grading_status
    CHECK (grading_status IN ('AUTO','PENDING_AI','QUEUED','GRADING','AI_GRADED','FAILED'));

-- 2. Worker lock time (stuck GRADING rows are failed and refunded) and the reason a grading failed.
ALTER TABLE attempt_answers ADD COLUMN IF NOT EXISTS grading_locked_at TIMESTAMP;
ALTER TABLE attempt_answers ADD COLUMN IF NOT EXISTS grading_error VARCHAR(30);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_grading_error') THEN
        ALTER TABLE attempt_answers ADD CONSTRAINT chk_grading_error CHECK (grading_error IS NULL OR grading_error IN
            ('AI_TIMEOUT','AI_UPSTREAM_ERROR','AI_INVALID_OUTPUT','DIAGRAM_TOO_LARGE','TEXT_TOO_LONG','QUOTA_REFUNDED'));
    END IF;
END $$;

-- 3. The worker claims QUEUED rows; the sweep looks for GRADING rows whose lock is old.
CREATE INDEX IF NOT EXISTS idx_aa_grading_queue ON attempt_answers (grading_status, attempt_answer_id)
    WHERE grading_status IN ('QUEUED','GRADING');

-- 4. V35 dropped the purpose CHECK; restore it with the student purposes.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_ai_purpose') THEN
        ALTER TABLE ai_usage_logs ADD CONSTRAINT chk_ai_purpose
            CHECK (purpose IN ('QUESTION_GEN','ESSAY_GRADING','EXPLANATION'));
    END IF;
END $$;

-- 5. Quota sums per user/source, and the sweep for reservations left PENDING.
CREATE INDEX IF NOT EXISTS idx_ai_usage_quota_source ON ai_usage_logs (user_id, billing_source, created_at);
CREATE INDEX IF NOT EXISTS idx_ai_usage_pending ON ai_usage_logs (created_at) WHERE status = 'PENDING';
