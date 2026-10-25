-- V35__ai_usage_for_explanations.sql

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ai_usage_logs' AND column_name = 'billing_source') THEN
        ALTER TABLE ai_usage_logs ADD COLUMN billing_source VARCHAR(10);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ai_usage_logs' AND column_name = 'reserved_tokens') THEN
        ALTER TABLE ai_usage_logs ADD COLUMN reserved_tokens INT NOT NULL DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ai_usage_logs' AND column_name = 'question_count') THEN
        ALTER TABLE ai_usage_logs ADD COLUMN question_count INT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ai_usage_logs' AND column_name = 'attempt_id') THEN
        ALTER TABLE ai_usage_logs ADD COLUMN attempt_id BIGINT REFERENCES exam_attempts(attempt_id);
    END IF;
END $$;

UPDATE ai_usage_logs
SET billing_source = 'PLAN'
WHERE billing_source IS NULL;

-- Drop old check constraints on ai_usage_logs status/purpose if any
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN SELECT constraint_name FROM information_schema.table_constraints
             WHERE table_name = 'ai_usage_logs' AND constraint_type = 'CHECK'
    LOOP
        EXECUTE 'ALTER TABLE ai_usage_logs DROP CONSTRAINT IF EXISTS ' || quote_ident(r.constraint_name);
    END LOOP;
END $$;

ALTER TABLE ai_usage_logs ADD CONSTRAINT chk_ai_status CHECK (status IN ('PENDING','SUCCESS','PARTIAL','FAILED','TIMEOUT'));
ALTER TABLE ai_usage_logs ADD CONSTRAINT chk_ai_billing CHECK (billing_source IS NULL OR billing_source IN ('FREE','PLAN'));

CREATE INDEX IF NOT EXISTS idx_ai_usage_user_time ON ai_usage_logs (user_id, created_at);
