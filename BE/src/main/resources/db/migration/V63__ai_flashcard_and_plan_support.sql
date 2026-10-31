-- V62__ai_flashcard_and_plan_support.sql
-- Deadline 2 section 2 (group C + E): subscription plan config + AI flashcard.

-- 1) subscription_plans.features_json: backfill, NOT NULL, DEFAULT '[]'
--    (decision D6 - keep the JSON type created in V43, do NOT convert to jsonb)
UPDATE subscription_plans SET features_json = '[]' WHERE features_json IS NULL;
ALTER TABLE subscription_plans ALTER COLUMN features_json SET NOT NULL;
ALTER TABLE subscription_plans ALTER COLUMN features_json SET DEFAULT '[]'::json;

-- 2) + 3) ai_usage_logs CHECK constraints.
-- Current state as created by migrations:
--   V35: chk_ai_status  = ('PENDING','SUCCESS','PARTIAL','FAILED','TIMEOUT')
--        chk_ai_billing = ('FREE','PLAN')                 <- must stay untouched (D1)
--   V43: chk_ai_purpose = ('EXPLANATION','ESSAY_GRADING','QUIZ_GENERATION',
--                          'SMART_PRACTICE','RECOMMENDATION','WEAKNESS_REPORT')
-- Drop any existing purpose/status check (whatever its name) so this file can be
-- re-applied safely, then re-create it with the extra values.
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN SELECT con.conname
             FROM pg_constraint con
             WHERE con.conrelid = 'ai_usage_logs'::regclass
               AND con.contype = 'c'
               AND con.conname <> 'chk_ai_billing'
               AND (con.conname IN ('chk_ai_purpose', 'chk_ai_status')
                    OR pg_get_constraintdef(con.oid) LIKE '%purpose%'
                    OR pg_get_constraintdef(con.oid) LIKE '%status%')
    LOOP
        EXECUTE 'ALTER TABLE ai_usage_logs DROP CONSTRAINT IF EXISTS ' || quote_ident(r.conname);
    END LOOP;
END $$;

-- purpose: allow FLASHCARD_GENERATE (D4). purpose is VARCHAR(20) since V9
-- (V43's ADD COLUMN IF NOT EXISTS VARCHAR(30) was a no-op); the value is 18 chars,
-- so no column type change is required.
ALTER TABLE ai_usage_logs ADD CONSTRAINT chk_ai_purpose
    CHECK (purpose IN (
        'EXPLANATION',
        'ESSAY_GRADING',
        'QUIZ_GENERATION',
        'SMART_PRACTICE',
        'RECOMMENDATION',
        'WEAKNESS_REPORT',
        'FLASHCARD_GENERATE'
    ));

-- status: allow PROCESSING as the worker claim state (D4). status is VARCHAR(10)
-- since V9 and 'PROCESSING' is exactly 10 chars, so no column type change is required.
ALTER TABLE ai_usage_logs ADD CONSTRAINT chk_ai_status
    CHECK (status IN ('PENDING','PROCESSING','SUCCESS','PARTIAL','FAILED','TIMEOUT'));

-- 4) partial index for the stuck-PENDING sweep (plan section 10.9).
-- Already created by V39; IF NOT EXISTS keeps this a no-op on existing databases.
CREATE INDEX IF NOT EXISTS idx_ai_usage_pending ON ai_usage_logs(created_at) WHERE status = 'PENDING';
