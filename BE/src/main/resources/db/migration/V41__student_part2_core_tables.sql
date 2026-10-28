-- V41__student_part2_core_tables.sql
-- Covers: §26.1 items 1-9, 11-12 from student-full-spec-part2.md
-- APIs: EN-01..04, LP-01..02, MN-01..05, MQ-01..06, PQ-01..04, CD-03..07,
--       PY-01..06, SB-01..04, DI-01..08, CQ-01..06
-- Strategy: additive only, idempotent (IF NOT EXISTS guards).

-- =====================================================================
-- 1. ENROLLMENTS: add cancelled_at (EN-03 cancel), ensure status values
-- =====================================================================
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP;
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS cancel_reason VARCHAR(255);

-- =====================================================================
-- 2. DOCUMENTS: extend for MQ-01 (page_count, owner_id alias, file_url)
-- documents table exists from V4 but lacks these columns
-- =====================================================================
ALTER TABLE documents ADD COLUMN IF NOT EXISTS file_url       VARCHAR(512);
ALTER TABLE documents ADD COLUMN IF NOT EXISTS file_name      VARCHAR(255);
ALTER TABLE documents ADD COLUMN IF NOT EXISTS file_size_kb   INT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS page_count     INT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS course_id      BIGINT REFERENCES courses(course_id) ON DELETE SET NULL;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS created_at     TIMESTAMP NOT NULL DEFAULT NOW();

-- owner_id is already user_id in V4 (documents.user_id). No rename needed.

CREATE INDEX IF NOT EXISTS idx_documents_user       ON documents(user_id);
CREATE INDEX IF NOT EXISTS idx_documents_course     ON documents(course_id);
CREATE INDEX IF NOT EXISTS idx_documents_created_at ON documents(created_at);

-- =====================================================================
-- 3. QUIZ_GENERATION_JOBS: MQ-03..06 async AI document-to-quiz
-- =====================================================================
CREATE TABLE IF NOT EXISTS quiz_generation_jobs (
    job_id          BIGSERIAL    PRIMARY KEY,
    user_id         BIGINT       NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    doc_id          BIGINT       NOT NULL REFERENCES documents(doc_id) ON DELETE CASCADE,
    course_id       BIGINT       REFERENCES courses(course_id) ON DELETE SET NULL,
    question_count  INT          NOT NULL DEFAULT 10,
    status          VARCHAR(20)  NOT NULL DEFAULT 'PENDING',
    result_exam_id  BIGINT       REFERENCES exams(exam_id) ON DELETE SET NULL,
    error_message   TEXT,
    estimated_tokens INT,
    actual_tokens   INT,
    created_at      TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP    NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_qgj_status CHECK (status IN ('PENDING','PROCESSING','COMPLETED','FAILED'))
);
CREATE INDEX IF NOT EXISTS idx_qgj_user       ON quiz_generation_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_qgj_doc        ON quiz_generation_jobs(doc_id);
CREATE INDEX IF NOT EXISTS idx_qgj_status     ON quiz_generation_jobs(status);
-- Unique: only one active job per (user, document)
CREATE UNIQUE INDEX IF NOT EXISTS uq_qgj_user_doc_active
    ON quiz_generation_jobs(user_id, doc_id)
    WHERE status IN ('PENDING','PROCESSING');

-- =====================================================================
-- 4. PAYMENTS: PY-01..06 & EN-01 (course purchase) & SB-03 (subscription purchase)
-- =====================================================================
CREATE TABLE IF NOT EXISTS payments (
    payment_id   BIGSERIAL    PRIMARY KEY,
    user_id      BIGINT       NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    order_code   VARCHAR(100) NOT NULL UNIQUE,
    type         VARCHAR(30)  NOT NULL,           -- COURSE, SUBSCRIPTION
    ref_id       BIGINT,                           -- course_id or plan_id
    amount       DECIMAL(12,2) NOT NULL,
    currency     VARCHAR(10)  NOT NULL DEFAULT 'VND',
    status       VARCHAR(20)  NOT NULL DEFAULT 'PENDING',
    payos_raw    JSON,
    checkout_url VARCHAR(512),
    qr_code_url  VARCHAR(512),
    expires_at   TIMESTAMP,
    paid_at      TIMESTAMP,
    cancelled_at TIMESTAMP,
    created_at   TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMP    NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_payment_type   CHECK (type   IN ('COURSE','SUBSCRIPTION')),
    CONSTRAINT chk_payment_status CHECK (status IN ('PENDING','SUCCEEDED','FAILED','EXPIRED','CANCELLED'))
);
CREATE INDEX IF NOT EXISTS idx_payments_user        ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_order_code  ON payments(order_code);
CREATE INDEX IF NOT EXISTS idx_payments_status      ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_created_at  ON payments(created_at);

-- =====================================================================
-- 5. DISCOUNTS: extend existing table (V4) for PY-05 (validate discount)
-- =====================================================================
ALTER TABLE discounts ADD COLUMN IF NOT EXISTS percent      DECIMAL(5,2);
ALTER TABLE discounts ADD COLUMN IF NOT EXISTS usage_limit  INT NOT NULL DEFAULT 1;
ALTER TABLE discounts ADD COLUMN IF NOT EXISTS used_count   INT NOT NULL DEFAULT 0;
ALTER TABLE discounts ADD COLUMN IF NOT EXISTS expires_at   TIMESTAMP;
ALTER TABLE discounts ADD COLUMN IF NOT EXISTS description  TEXT;
-- Fix: V4 has 'value' but spec uses 'percent' for percentage-based discounts.
-- Both co-exist: 'value' for fixed, 'percent' for percentage discounts.
-- 'discount_type' column: 'FIXED' or 'PERCENT'

-- =====================================================================
-- 6. PRACTICE_EXAMS: PQ-01..04 student-configured practice sessions
-- =====================================================================
CREATE TABLE IF NOT EXISTS practice_exams (
    practice_exam_id  BIGSERIAL    PRIMARY KEY,
    user_id           BIGINT       NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    course_id         BIGINT       NOT NULL REFERENCES courses(course_id) ON DELETE CASCADE,
    title             VARCHAR(255) NOT NULL DEFAULT 'Đề luyện tập',
    question_count    INT          NOT NULL DEFAULT 10,
    duration_minutes  INT          NOT NULL DEFAULT 30,
    difficulty        VARCHAR(20),               -- EASY, MEDIUM, HARD, MIXED
    category_ids      JSON,                      -- array of category_id filters
    question_types    JSON,                      -- array of question_type filters
    status            VARCHAR(20)  NOT NULL DEFAULT 'READY',
    exam_id           BIGINT       REFERENCES exams(exam_id) ON DELETE SET NULL,
    created_at        TIMESTAMP    NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_pe_status CHECK (status IN ('GENERATING','READY','FAILED'))
);
CREATE INDEX IF NOT EXISTS idx_practice_exams_user   ON practice_exams(user_id);
CREATE INDEX IF NOT EXISTS idx_practice_exams_course ON practice_exams(course_id);

-- =====================================================================
-- 7. CODE_SUBMISSIONS: CD-04..07 programming exam submissions
-- =====================================================================
CREATE TABLE IF NOT EXISTS code_submissions (
    submission_id       BIGSERIAL    PRIMARY KEY,
    attempt_answer_id   BIGINT       NOT NULL REFERENCES attempt_answers(attempt_answer_id) ON DELETE CASCADE,
    attempt_id          BIGINT       NOT NULL REFERENCES exam_attempts(attempt_id) ON DELETE CASCADE,
    question_id         BIGINT       NOT NULL REFERENCES questions(question_id) ON DELETE CASCADE,
    user_id             BIGINT       NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    language            VARCHAR(30)  NOT NULL,  -- java, python, c, cpp
    source_code         TEXT         NOT NULL,
    judge0_token        VARCHAR(100),           -- Judge0 submission token
    status              VARCHAR(30)  NOT NULL DEFAULT 'PENDING',
    stdout              TEXT,
    stderr              TEXT,
    compile_output      TEXT,
    time_ms             INT,
    memory_kb           INT,
    test_results        JSON,                   -- array of {testCaseId, passed, ...}
    passed_count        INT,
    total_count         INT,
    submitted_at        TIMESTAMP    NOT NULL DEFAULT NOW(),
    judged_at           TIMESTAMP,
    CONSTRAINT chk_cs_status CHECK (status IN ('PENDING','RUNNING','ACCEPTED','WRONG_ANSWER','TIME_LIMIT','MEMORY_LIMIT','COMPILE_ERROR','RUNTIME_ERROR','SYSTEM_ERROR'))
);
CREATE INDEX IF NOT EXISTS idx_code_submissions_attempt_answer ON code_submissions(attempt_answer_id);
CREATE INDEX IF NOT EXISTS idx_code_submissions_attempt        ON code_submissions(attempt_id);
CREATE INDEX IF NOT EXISTS idx_code_submissions_user           ON code_submissions(user_id);
CREATE INDEX IF NOT EXISTS idx_code_submissions_status         ON code_submissions(status);

-- =====================================================================
-- 8. DISCUSSIONS & DISCUSSION_COMMENTS: DI-01..08
-- =====================================================================
CREATE TABLE IF NOT EXISTS discussions (
    discussion_id   BIGSERIAL    PRIMARY KEY,
    course_id       BIGINT       NOT NULL REFERENCES courses(course_id) ON DELETE CASCADE,
    user_id         BIGINT       NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    question_id     BIGINT       REFERENCES questions(question_id) ON DELETE SET NULL,
    title           VARCHAR(500) NOT NULL,
    content         TEXT         NOT NULL,
    status          VARCHAR(20)  NOT NULL DEFAULT 'OPEN',   -- OPEN, CLOSED, HIDDEN
    is_pinned       BOOLEAN      NOT NULL DEFAULT FALSE,
    view_count      INT          NOT NULL DEFAULT 0,
    comment_count   INT          NOT NULL DEFAULT 0,
    created_at      TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP    NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_disc_status CHECK (status IN ('OPEN','CLOSED','HIDDEN'))
);
CREATE INDEX IF NOT EXISTS idx_discussions_course     ON discussions(course_id);
CREATE INDEX IF NOT EXISTS idx_discussions_user       ON discussions(user_id);
CREATE INDEX IF NOT EXISTS idx_discussions_created_at ON discussions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_discussions_question   ON discussions(question_id);

CREATE TABLE IF NOT EXISTS discussion_comments (
    comment_id      BIGSERIAL    PRIMARY KEY,
    discussion_id   BIGINT       NOT NULL REFERENCES discussions(discussion_id) ON DELETE CASCADE,
    user_id         BIGINT       NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    parent_id       BIGINT       REFERENCES discussion_comments(comment_id) ON DELETE CASCADE,
    content         TEXT         NOT NULL,
    is_accepted     BOOLEAN      NOT NULL DEFAULT FALSE,  -- instructor marks answer
    status          VARCHAR(20)  NOT NULL DEFAULT 'VISIBLE',
    created_at      TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP    NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_dc_status CHECK (status IN ('VISIBLE','HIDDEN'))
);
CREATE INDEX IF NOT EXISTS idx_discussion_comments_discussion ON discussion_comments(discussion_id);
CREATE INDEX IF NOT EXISTS idx_discussion_comments_user       ON discussion_comments(user_id);
CREATE INDEX IF NOT EXISTS idx_discussion_comments_parent     ON discussion_comments(parent_id);

-- =====================================================================
-- 9. QUESTION_CONTRIBUTIONS: CQ-01..06 student question contributions
-- =====================================================================
CREATE TABLE IF NOT EXISTS question_contributions (
    contribution_id   BIGSERIAL    PRIMARY KEY,
    user_id           BIGINT       NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    course_id         BIGINT       NOT NULL REFERENCES courses(course_id) ON DELETE CASCADE,
    question_type     VARCHAR(50)  NOT NULL DEFAULT 'SINGLE_CHOICE',
    content           TEXT         NOT NULL,
    options_json      JSON,                     -- answer options for MCQ
    answer_key_json   JSON,                     -- correct answer(s)
    explanation       TEXT,
    difficulty        VARCHAR(20),
    category_ids      JSON,                     -- suggested categories
    media_url         VARCHAR(512),             -- uploaded image/file (Cloudinary)
    status            VARCHAR(20)  NOT NULL DEFAULT 'PENDING',
    review_note       TEXT,                     -- manager feedback on reject
    reviewed_by       BIGINT       REFERENCES users(user_id) ON DELETE SET NULL,
    reviewed_at       TIMESTAMP,
    accepted_question_id BIGINT    REFERENCES questions(question_id) ON DELETE SET NULL,
    submitted_at      TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMP    NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_contrib_status CHECK (status IN ('PENDING','ACCEPTED','REJECTED'))
);
CREATE INDEX IF NOT EXISTS idx_contributions_user   ON question_contributions(user_id);
CREATE INDEX IF NOT EXISTS idx_contributions_course ON question_contributions(course_id);
CREATE INDEX IF NOT EXISTS idx_contributions_status ON question_contributions(status);

-- =====================================================================
-- 10. NOTIFICATIONS: extend existing tables (V4) for NT-01..03
-- notifications + user_notifications already exist from V4.
-- Add missing columns needed by spec.
-- =====================================================================
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS reference_id   BIGINT;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS reference_type VARCHAR(50);  -- EXAM, DISCUSSION, CONTEST, etc.
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS is_system      BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE user_notifications ADD COLUMN IF NOT EXISTS received_at TIMESTAMP NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_notifications_type       ON notifications(type);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_notifications_unread
    ON user_notifications(user_id)
    WHERE is_read = FALSE;
