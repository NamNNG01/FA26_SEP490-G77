-- V52__khai_hieu_api_support.sql
-- Additive storage for Khai Hieu's EN, MQ, SB/PY, CD and NT endpoints.

-- One enrollment row is retained across cancel/re-enroll cycles; serialize active writes in services.
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP;
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS cancel_reason VARCHAR(255);
WITH duplicate_active AS (
    SELECT enrollment_id, ROW_NUMBER() OVER (PARTITION BY user_id, course_id ORDER BY enrolled_at DESC, enrollment_id DESC) AS row_num
    FROM enrollments WHERE status = 'ACTIVE'
)
UPDATE enrollments e SET status = 'CANCELLED', cancelled_at = COALESCE(e.cancelled_at, NOW()),
    cancel_reason = COALESCE(e.cancel_reason, 'DUPLICATE_LEGACY_ENROLLMENT')
FROM duplicate_active d WHERE e.enrollment_id = d.enrollment_id AND d.row_num > 1;
CREATE UNIQUE INDEX IF NOT EXISTS uq_enrollments_active_user_course ON enrollments(user_id, course_id) WHERE status = 'ACTIVE';
CREATE INDEX IF NOT EXISTS idx_enrollments_user_course_status ON enrollments(user_id, course_id, status);

-- Payment identifiers are deliberately separate: merchant orderCode stays a stable string,
-- while PayOS requires a numeric orderCode. The unique index is the idempotency boundary.
ALTER TABLE payments ADD COLUMN IF NOT EXISTS payos_order_code BIGINT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS discount_id BIGINT REFERENCES discounts(discount_id) ON DELETE SET NULL;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS discount_amount DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS title VARCHAR(255);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS payment_link_id VARCHAR(100);
CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_payos_order_code ON payments(payos_order_code) WHERE payos_order_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payments_user_created ON payments(user_id, created_at DESC);

-- The current API records the preference only. No stored payment instrument / recurring charge exists.
ALTER TABLE user_subscriptions ADD COLUMN IF NOT EXISTS auto_renew BOOLEAN NOT NULL DEFAULT FALSE;
DO $$
BEGIN
    ALTER TABLE user_subscriptions DROP CONSTRAINT IF EXISTS chk_us_status;
    ALTER TABLE user_subscriptions DROP CONSTRAINT IF EXISTS user_subscriptions_status_check;
EXCEPTION WHEN others THEN NULL;
END $$;
ALTER TABLE user_subscriptions ADD CONSTRAINT chk_us_status
    CHECK (status IN ('ACTIVE','EXPIRED','CANCELLED','SUPERSEDED'));
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_active_user ON user_subscriptions(user_id, end_date DESC) WHERE status = 'ACTIVE';

-- Material metadata and worker state. Files are stored in Cloudinary as authenticated raw assets;
-- extracted content remains in the existing documents.extracted_content column for quiz generation.
ALTER TABLE documents ADD COLUMN IF NOT EXISTS title VARCHAR(255);
ALTER TABLE documents ADD COLUMN IF NOT EXISTS file_url VARCHAR(512);
ALTER TABLE documents ADD COLUMN IF NOT EXISTS file_name VARCHAR(255);
ALTER TABLE documents ADD COLUMN IF NOT EXISTS file_size_kb INT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS page_count INT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT NOW();
ALTER TABLE documents ADD COLUMN IF NOT EXISTS generation_type VARCHAR(50) NOT NULL DEFAULT 'MATERIAL';
ALTER TABLE documents ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'UPLOADED';

ALTER TABLE quiz_generation_jobs ADD COLUMN IF NOT EXISTS difficulty VARCHAR(20) NOT NULL DEFAULT 'MEDIUM';
ALTER TABLE quiz_generation_jobs ADD COLUMN IF NOT EXISTS source_lesson_id BIGINT;
ALTER TABLE quiz_generation_jobs ADD COLUMN IF NOT EXISTS progress INT NOT NULL DEFAULT 0;
ALTER TABLE quiz_generation_jobs ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP;
ALTER TABLE quiz_generation_jobs ADD COLUMN IF NOT EXISTS ai_usage_log_id BIGINT REFERENCES ai_usage_logs(log_id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_qgj_pending ON quiz_generation_jobs(created_at) WHERE status = 'PENDING';

-- Runtime configuration and public/hidden fixtures are kept outside question_metadata to avoid
-- changing the strict question metadata contract and to keep hidden fixtures out of question APIs.
CREATE TABLE IF NOT EXISTS code_question_configs (
    question_id BIGINT PRIMARY KEY REFERENCES questions(question_id) ON DELETE CASCADE,
    allowed_languages JSONB NOT NULL DEFAULT '["JAVA","PYTHON","C","CPP"]'::jsonb,
    code_template TEXT,
    time_limit_ms INT NOT NULL DEFAULT 5000 CHECK (time_limit_ms BETWEEN 1 AND 5000),
    memory_limit_kb INT NOT NULL DEFAULT 262144 CHECK (memory_limit_kb BETWEEN 1 AND 262144),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS code_test_cases (
    test_case_id BIGSERIAL PRIMARY KEY,
    question_id BIGINT NOT NULL REFERENCES questions(question_id) ON DELETE CASCADE,
    input_data TEXT NOT NULL DEFAULT '',
    expected_output TEXT NOT NULL DEFAULT '',
    is_hidden BOOLEAN NOT NULL DEFAULT FALSE,
    order_index INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_code_test_cases_question ON code_test_cases(question_id, is_hidden, order_index, test_case_id);

-- API result statuses describe the whole submission, not a Judge0 transport status.
ALTER TABLE code_submissions DROP CONSTRAINT IF EXISTS chk_cs_status;
ALTER TABLE code_submissions ADD CONSTRAINT chk_cs_status CHECK (status IN (
    'PENDING','RUNNING','PASSED','FAILED','ACCEPTED','WRONG_ANSWER','TIME_LIMIT',
    'MEMORY_LIMIT','COMPILE_ERROR','RUNTIME_ERROR','SYSTEM_ERROR'
));

-- Notification content can be linked to a stable app route; delivery/read state remains user-scoped.
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS link VARCHAR(512);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS reference_id BIGINT;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS reference_type VARCHAR(50);
ALTER TABLE user_notifications ADD COLUMN IF NOT EXISTS received_at TIMESTAMP NOT NULL DEFAULT NOW();
CREATE INDEX IF NOT EXISTS idx_user_notifications_user_unread ON user_notifications(user_id, is_read, user_notification_id DESC);
