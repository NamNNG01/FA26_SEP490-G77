-- V106: Monthly AI token quota for Course Managers (Global Default in system_settings + per-manager override on users).

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS manager_monthly_ai_token_limit BIGINT;

ALTER TABLE manager_explanation_jobs
    ADD COLUMN IF NOT EXISTS ai_usage_log_id BIGINT REFERENCES ai_usage_logs(log_id);

DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN SELECT con.conname
             FROM pg_constraint con
             WHERE con.conrelid = 'ai_usage_logs'::regclass
               AND con.contype = 'c'
               AND (con.conname = 'chk_ai_billing'
                    OR pg_get_constraintdef(con.oid) LIKE '%billing_source%')
    LOOP
        EXECUTE 'ALTER TABLE ai_usage_logs DROP CONSTRAINT IF EXISTS ' || quote_ident(r.conname);
    END LOOP;
END $$;

ALTER TABLE ai_usage_logs
    ADD CONSTRAINT chk_ai_billing
        CHECK (billing_source IS NULL OR billing_source IN ('FREE', 'PLAN', 'MANAGER'));
