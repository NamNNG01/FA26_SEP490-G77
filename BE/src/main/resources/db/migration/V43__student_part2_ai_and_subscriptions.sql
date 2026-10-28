-- V43__student_part2_ai_and_subscriptions.sql
-- Covers: §26.1 items 6, 7, 8, 16, 17 from student-full-spec-part2.md
-- APIs: SB-01..04, PQ-01..04 (practice_exams already in V41),
--       AI-01..04, MQ-03 (ai_usage_logs purpose extension)

-- =====================================================================
-- 1. SUBSCRIPTION_PLANS: extend for SB-01..04
-- subscription_plans exists from V4 (plan_id, plan_name, price, duration_days, ai_token_limit)
-- Need: description, features_json, is_active
-- =====================================================================
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS description   TEXT;
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS features_json JSON;
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS is_active     BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS created_at    TIMESTAMP NOT NULL DEFAULT NOW();

-- =====================================================================
-- 2. USER_SUBSCRIPTIONS: extend for SB-02..03
-- user_subscriptions exists from V4 (subscription_id, user_id, plan_id, start_date, end_date, status, paid_amount)
-- Need: payment_id reference, cancelled_at
-- =====================================================================
ALTER TABLE user_subscriptions ADD COLUMN IF NOT EXISTS payment_id    BIGINT REFERENCES payments(payment_id) ON DELETE SET NULL;
ALTER TABLE user_subscriptions ADD COLUMN IF NOT EXISTS cancelled_at  TIMESTAMP;
ALTER TABLE user_subscriptions ADD COLUMN IF NOT EXISTS created_at    TIMESTAMP NOT NULL DEFAULT NOW();

DO $$
BEGIN
    BEGIN
        ALTER TABLE user_subscriptions DROP CONSTRAINT IF EXISTS user_subscriptions_status_check;
    EXCEPTION WHEN others THEN NULL;
    END;
END $$;
ALTER TABLE user_subscriptions ADD CONSTRAINT chk_us_status
    CHECK (status IN ('ACTIVE','EXPIRED','CANCELLED'));

CREATE INDEX IF NOT EXISTS idx_us_status ON user_subscriptions(user_id, status);

-- =====================================================================
-- 3. EXAM_ATTEMPTS: add mode column for SA-05 multi-mode result
-- mode already tracked by the exam type but SA-05 returns it explicitly
-- =====================================================================
ALTER TABLE exam_attempts ADD COLUMN IF NOT EXISTS mode VARCHAR(30) NOT NULL DEFAULT 'EXAM';

DO $$
BEGIN
    BEGIN
        ALTER TABLE exam_attempts DROP CONSTRAINT IF EXISTS chk_ea_mode;
    EXCEPTION WHEN others THEN NULL;
    END;
END $$;
ALTER TABLE exam_attempts ADD CONSTRAINT chk_ea_mode
    CHECK (mode IN ('EXAM','PRACTICE','REVIEW','MATERIAL_QUIZ','CONTEST','SMART_PRACTICE'));

CREATE INDEX IF NOT EXISTS idx_ea_mode ON exam_attempts(user_id, mode);

-- =====================================================================
-- 4. EXAMS: add mode/source tracking for generated exams
-- practice_exam_id, quiz_job_id, ai_job_id link generated exams back to source
-- =====================================================================
ALTER TABLE exams ADD COLUMN IF NOT EXISTS mode              VARCHAR(30) NOT NULL DEFAULT 'EXAM';
ALTER TABLE exams ADD COLUMN IF NOT EXISTS practice_exam_id  BIGINT REFERENCES practice_exams(practice_exam_id) ON DELETE SET NULL;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS quiz_job_id       BIGINT REFERENCES quiz_generation_jobs(job_id) ON DELETE SET NULL;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS ai_job_id         BIGINT;  -- FK to ai_personalization_jobs added after table creation below
ALTER TABLE exams ADD COLUMN IF NOT EXISTS duration_minutes  INT;

-- =====================================================================
-- 5. AI_USAGE_LOGS: extend purpose CHECK for new AI features
-- ai_usage_logs exists from V9 (+ columns added in V35)
-- Need: add new purpose values for MQ-03, AI-01, AI-03, AI-04
-- =====================================================================
DO $$
DECLARE
    r RECORD;
BEGIN
    -- Drop old purpose constraint if any
    FOR r IN (SELECT constraint_name FROM information_schema.table_constraints
              WHERE table_name = 'ai_usage_logs' AND constraint_type = 'CHECK'
                AND constraint_name LIKE '%purpose%')
    LOOP
        EXECUTE 'ALTER TABLE ai_usage_logs DROP CONSTRAINT IF EXISTS ' || quote_ident(r.constraint_name);
    END LOOP;
END $$;

-- Add purpose column if not exists (V9 already has it with narrow CHECK — we'll replace)
ALTER TABLE ai_usage_logs ADD COLUMN IF NOT EXISTS purpose VARCHAR(30);

-- Backfill: old rows used 'QUESTION_GEN' or 'ESSAY_GRADING' (V9 values)
UPDATE ai_usage_logs SET purpose = 'EXPLANATION'   WHERE purpose = 'QUESTION_GEN';
-- ESSAY_GRADING stays valid

ALTER TABLE ai_usage_logs ADD CONSTRAINT chk_ai_purpose
    CHECK (purpose IN (
        'EXPLANATION',
        'ESSAY_GRADING',
        'QUIZ_GENERATION',
        'SMART_PRACTICE',
        'RECOMMENDATION',
        'WEAKNESS_REPORT'
    ));

CREATE INDEX IF NOT EXISTS idx_ai_usage_purpose ON ai_usage_logs(user_id, purpose, created_at);

-- =====================================================================
-- 6. AI_PERSONALIZATION_JOBS: AI-01..02 (smart practice job)
-- =====================================================================
CREATE TABLE IF NOT EXISTS ai_personalization_jobs (
    job_id          BIGSERIAL    PRIMARY KEY,
    student_id      BIGINT       NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    course_id       BIGINT       NOT NULL REFERENCES courses(course_id) ON DELETE CASCADE,
    type            VARCHAR(30)  NOT NULL DEFAULT 'SMART_PRACTICE',
    status          VARCHAR(20)  NOT NULL DEFAULT 'PROCESSING',
    analysis_json   JSON,                  -- weakCategories, strongCategories from AI-01 response
    result_exam_id  BIGINT       REFERENCES exams(exam_id) ON DELETE SET NULL,
    error_message   TEXT,
    estimated_tokens INT,
    actual_tokens   INT,
    created_at      TIMESTAMP    NOT NULL DEFAULT NOW(),
    expires_at      TIMESTAMP    NOT NULL DEFAULT (NOW() + INTERVAL '5 minutes'),
    completed_at    TIMESTAMP,
    CONSTRAINT chk_apj_type   CHECK (type   IN ('SMART_PRACTICE')),
    CONSTRAINT chk_apj_status CHECK (status IN ('PROCESSING','COMPLETED','FAILED'))
);
CREATE INDEX IF NOT EXISTS idx_apj_student    ON ai_personalization_jobs(student_id);
CREATE INDEX IF NOT EXISTS idx_apj_course     ON ai_personalization_jobs(course_id);
CREATE INDEX IF NOT EXISTS idx_apj_status     ON ai_personalization_jobs(status);
CREATE INDEX IF NOT EXISTS idx_apj_expires    ON ai_personalization_jobs(expires_at) WHERE status = 'PROCESSING';

-- Now back-reference from exams to ai_personalization_jobs
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'exams_ai_job_id_fkey') THEN
        ALTER TABLE exams ADD CONSTRAINT exams_ai_job_id_fkey
            FOREIGN KEY (ai_job_id) REFERENCES ai_personalization_jobs(job_id) ON DELETE SET NULL;
    END IF;
END $$;

-- =====================================================================
-- 7. AI_RECOMMENDATION_CACHE: AI-03 recommendations + AI-04 weakness reports
-- =====================================================================
CREATE TABLE IF NOT EXISTS ai_recommendation_cache (
    cache_id        BIGSERIAL    PRIMARY KEY,
    student_id      BIGINT       NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    course_id       BIGINT       NOT NULL REFERENCES courses(course_id) ON DELETE CASCADE,
    type            VARCHAR(30)  NOT NULL,   -- RECOMMENDATION, WEAKNESS_REPORT
    period          VARCHAR(20),             -- LAST_7_DAYS, LAST_30_DAYS, ALL_TIME (for WEAKNESS_REPORT)
    result_json     JSON         NOT NULL,
    generated_at    TIMESTAMP    NOT NULL DEFAULT NOW(),
    expires_at      TIMESTAMP    NOT NULL,
    actual_tokens   INT,
    CONSTRAINT chk_arc_type CHECK (type IN ('RECOMMENDATION','WEAKNESS_REPORT'))
);
CREATE INDEX IF NOT EXISTS idx_arc_lookup
    ON ai_recommendation_cache(student_id, course_id, type, period);
CREATE INDEX IF NOT EXISTS idx_arc_expires
    ON ai_recommendation_cache(expires_at);

-- Unique: one cache entry per (student, course, type, period)
-- Expiry handled at application level via expires_at column.
-- NOW() cannot be used in index predicates (non-IMMUTABLE).
CREATE UNIQUE INDEX IF NOT EXISTS uq_arc_lookup
    ON ai_recommendation_cache(student_id, course_id, type, COALESCE(period, ''));

-- =====================================================================
-- 8. EXAM_ATTEMPTS / NOTEBOOK: extend for MN-01..05 (review notebook)
-- No new table needed — MN queries use attempt_answers with is_bookmarked/wrong
-- Add is_bookmarked to attempt_answers for MN-02 bookmark
-- =====================================================================
ALTER TABLE attempt_answers ADD COLUMN IF NOT EXISTS is_bookmarked BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE attempt_answers ADD COLUMN IF NOT EXISTS reviewed_at   TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_aa_bookmarked ON attempt_answers(attempt_id) WHERE is_bookmarked = TRUE;
CREATE INDEX IF NOT EXISTS idx_aa_is_correct  ON attempt_answers(attempt_id, is_correct);

-- =====================================================================
-- 9. COURSE_PROGRESS: extend enrollments for LP-01..02
-- Already have enrollments.progress (INT). Add per-module tracking.
-- =====================================================================
CREATE TABLE IF NOT EXISTS module_progress (
    module_progress_id  BIGSERIAL   PRIMARY KEY,
    user_id             BIGINT      NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    course_id           BIGINT      NOT NULL REFERENCES courses(course_id) ON DELETE CASCADE,
    module_id           BIGINT      NOT NULL REFERENCES modules(module_id) ON DELETE CASCADE,
    completed_exams     INT         NOT NULL DEFAULT 0,
    total_exams         INT         NOT NULL DEFAULT 0,
    last_score          DECIMAL(5,2),
    last_attempt_at     TIMESTAMP,
    completed_at        TIMESTAMP,
    UNIQUE (user_id, module_id)
);
CREATE INDEX IF NOT EXISTS idx_module_progress_user_course ON module_progress(user_id, course_id);

-- =====================================================================
-- 10. AUTO-EXPIRE ai_personalization_jobs: pg background job alternative
-- Use a cleanup trigger on SELECT (lightweight approach via expires_at index)
-- Actual cleanup done by application scheduler; index is the DB side.
-- =====================================================================

-- =====================================================================
-- 11. PERFORMANCE INDEXES for Part 2 student queries
-- =====================================================================
CREATE INDEX IF NOT EXISTS idx_enrollments_status ON enrollments(user_id, status);
CREATE INDEX IF NOT EXISTS idx_ea_user_exam_mode  ON exam_attempts(user_id, exam_id, mode);
CREATE INDEX IF NOT EXISTS idx_contests_ongoing   ON contests(status, start_time, end_time)
    WHERE status IN ('UPCOMING','ONGOING');
CREATE INDEX IF NOT EXISTS idx_qgj_user_status    ON quiz_generation_jobs(user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contributions_user_status ON question_contributions(user_id, status, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_discussions_course_pinned ON discussions(course_id, is_pinned DESC, created_at DESC);
