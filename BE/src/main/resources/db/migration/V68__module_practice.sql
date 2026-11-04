-- V68__module_practice.sql
-- Module Practice (MP-01..MP-12): per-module free practice with unlimited attempts, a frozen
-- randomized question order, per-question long-term progress and a strictly PRACTICE_ONLY reset.
--
-- Reuses the question bank, the attempt snapshot vocabulary (display_snapshot / key_snapshot),
-- the attempt grading_status vocabulary ('AUTO','PENDING_AI','QUEUED','GRADING','AI_GRADED','FAILED')
-- and ai_usage_logs. Nothing existing is altered; every object here is additive and idempotent.
--
-- Deletion model:
--   session -> session_questions -> answers        (FK ON DELETE CASCADE)
--   progress                                       (deleted explicitly by the reset service)
--   questions                                      (NO cascade: the shared bank is never touched)
--   users / courses / modules                      (ON DELETE CASCADE, as elsewhere in the schema)

-- =====================================================================
-- 1. QUESTION_PRACTICE_SESSIONS — one practice run of one module.
-- =====================================================================
CREATE TABLE IF NOT EXISTS question_practice_sessions (
    session_id        BIGSERIAL    PRIMARY KEY,
    user_id           BIGINT       NOT NULL REFERENCES users (user_id) ON DELETE CASCADE,
    course_id         BIGINT       NOT NULL REFERENCES courses (course_id) ON DELETE CASCADE,
    module_id         BIGINT       NOT NULL REFERENCES modules (module_id) ON DELETE CASCADE,
    mode              VARCHAR(30)  NOT NULL DEFAULT 'ALL',
    question_count    INT          NOT NULL DEFAULT 0,
    answered_count    INT          NOT NULL DEFAULT 0,
    correct_count     INT          NOT NULL DEFAULT 0,
    status            VARCHAR(30)  NOT NULL DEFAULT 'IN_PROGRESS',
    started_at        TIMESTAMP    NOT NULL DEFAULT now(),
    last_activity_at  TIMESTAMP    NOT NULL DEFAULT now(),
    completed_at      TIMESTAMP,
    duration_seconds  INT          NOT NULL DEFAULT 0
);

DO $$
BEGIN
    -- Only the two selection modes the feature actually implements; no phantom vocabulary.
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_qps_mode') THEN
        ALTER TABLE question_practice_sessions ADD CONSTRAINT chk_qps_mode
            CHECK (mode IN ('ALL', 'REVIEW'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_qps_status') THEN
        ALTER TABLE question_practice_sessions ADD CONSTRAINT chk_qps_status
            CHECK (status IN ('IN_PROGRESS', 'COMPLETED', 'ABANDONED'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_qps_counts') THEN
        ALTER TABLE question_practice_sessions ADD CONSTRAINT chk_qps_counts
            CHECK (question_count >= 0 AND answered_count >= 0 AND correct_count >= 0
                   AND duration_seconds >= 0
                   AND answered_count <= question_count
                   AND correct_count <= answered_count);
    END IF;
END $$;

-- At most one open practice run per (student, module). Closing a session is the only way to start
-- another one, which is what makes "create" idempotent under concurrent requests.
CREATE UNIQUE INDEX IF NOT EXISTS uq_qps_one_active
    ON question_practice_sessions (user_id, module_id)
    WHERE status = 'IN_PROGRESS';

CREATE INDEX IF NOT EXISTS idx_qps_user_module_status
    ON question_practice_sessions (user_id, module_id, status);
CREATE INDEX IF NOT EXISTS idx_qps_user_started
    ON question_practice_sessions (user_id, started_at DESC);

-- =====================================================================
-- 2. QUESTION_PRACTICE_SESSION_QUESTIONS — the frozen paper of one session.
--    display_snapshot / key_snapshot follow the attempt_answers contract exactly.
-- =====================================================================
CREATE TABLE IF NOT EXISTS question_practice_session_questions (
    session_question_id   BIGSERIAL    PRIMARY KEY,
    session_id            BIGINT       NOT NULL REFERENCES question_practice_sessions (session_id) ON DELETE CASCADE,
    question_id           BIGINT       NOT NULL REFERENCES questions (question_id),
    order_index           INT          NOT NULL,
    question_lock_version BIGINT       NOT NULL DEFAULT 0,
    scoring_version       INT          NOT NULL DEFAULT 1,
    display_snapshot      JSONB        NOT NULL,
    key_snapshot          JSONB        NOT NULL,
    attempt_count         INT          NOT NULL DEFAULT 0,
    latest_is_correct     BOOLEAN,
    latest_score          NUMERIC(5,2),
    grading_status        VARCHAR(15)  NOT NULL DEFAULT 'UNANSWERED',
    first_answered_at     TIMESTAMP,
    last_answered_at      TIMESTAMP
);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_qpsq_session_question') THEN
        ALTER TABLE question_practice_session_questions ADD CONSTRAINT uq_qpsq_session_question
            UNIQUE (session_id, question_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_qpsq_session_order') THEN
        ALTER TABLE question_practice_session_questions ADD CONSTRAINT uq_qpsq_session_order
            UNIQUE (session_id, order_index);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_qpsq_counts') THEN
        ALTER TABLE question_practice_session_questions ADD CONSTRAINT chk_qpsq_counts
            CHECK (order_index >= 0 AND attempt_count >= 0);
    END IF;
    -- 'UNANSWERED' is the practice-only "no attempt yet" state; the other six values are exactly
    -- the attempt_answers.grading_status vocabulary (V39) so the two features read the same way.
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_qpsq_grading_status') THEN
        ALTER TABLE question_practice_session_questions ADD CONSTRAINT chk_qpsq_grading_status
            CHECK (grading_status IN
                ('UNANSWERED', 'AUTO', 'PENDING_AI', 'QUEUED', 'GRADING', 'AI_GRADED', 'FAILED'));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_qpsq_session_order
    ON question_practice_session_questions (session_id, order_index);
CREATE INDEX IF NOT EXISTS idx_qpsq_question
    ON question_practice_session_questions (question_id);
-- The resume screen looks for the next unanswered question of one session.
CREATE INDEX IF NOT EXISTS idx_qpsq_session_unanswered
    ON question_practice_session_questions (session_id, order_index)
    WHERE grading_status = 'UNANSWERED';

-- =====================================================================
-- 3. QUESTION_PRACTICE_ANSWERS — every attempt, never overwritten.
-- =====================================================================
CREATE TABLE IF NOT EXISTS question_practice_answers (
    practice_answer_id  BIGSERIAL    PRIMARY KEY,
    session_question_id BIGINT       NOT NULL REFERENCES question_practice_session_questions (session_question_id) ON DELETE CASCADE,
    attempt_number      INT          NOT NULL,
    response            JSONB,
    is_correct          BOOLEAN,
    score_earned        NUMERIC(5,2),
    grading_status      VARCHAR(15)  NOT NULL DEFAULT 'AUTO',
    feedback            JSONB,
    criteria_scores     JSONB,
    grading_error       VARCHAR(30),
    grading_locked_at   TIMESTAMP,
    graded_at           TIMESTAMP,
    time_spent_seconds  INT          NOT NULL DEFAULT 0,
    answered_at         TIMESTAMP    NOT NULL DEFAULT now(),
    request_key         VARCHAR(128)
);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_qpa_attempt') THEN
        ALTER TABLE question_practice_answers ADD CONSTRAINT uq_qpa_attempt
            UNIQUE (session_question_id, attempt_number);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_qpa_values') THEN
        ALTER TABLE question_practice_answers ADD CONSTRAINT chk_qpa_values
            CHECK (attempt_number > 0 AND time_spent_seconds >= 0);
    END IF;
    -- Exactly the attempt_answers.grading_status vocabulary of V39, so both features read the same
    -- way. Practice writes AUTO (objective), QUEUED (rubric, waiting), GRADING (claimed), AI_GRADED and
    -- FAILED; the two remaining values are the shared vocabulary, not practice-only states.
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_qpa_grading_status') THEN
        ALTER TABLE question_practice_answers ADD CONSTRAINT chk_qpa_grading_status
            CHECK (grading_status IN ('AUTO', 'PENDING_AI', 'QUEUED', 'GRADING', 'AI_GRADED', 'FAILED'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_qpa_grading_error') THEN
        ALTER TABLE question_practice_answers ADD CONSTRAINT chk_qpa_grading_error
            CHECK (grading_error IS NULL OR grading_error IN
                ('AI_TIMEOUT', 'AI_UPSTREAM_ERROR', 'AI_INVALID_OUTPUT',
                 'DIAGRAM_TOO_LARGE', 'TEXT_TOO_LONG', 'QUOTA_REFUNDED', 'AI_INCOMPLETE',
                 'QUOTA_EXHAUSTED'));
    END IF;
END $$;

-- A retried submit with the same client key must never create a second attempt.
CREATE UNIQUE INDEX IF NOT EXISTS uq_qpa_request_key
    ON question_practice_answers (session_question_id, request_key)
    WHERE request_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_qpa_sq_attempt
    ON question_practice_answers (session_question_id, attempt_number);
-- The worker's claim and its stuck-row sweep both read only these two states.
CREATE INDEX IF NOT EXISTS idx_qpa_grading_queue
    ON question_practice_answers (grading_status, practice_answer_id)
    WHERE grading_status IN ('QUEUED', 'GRADING');

-- =====================================================================
-- 4. QUESTION_PRACTICE_PROGRESS — long-term, per student / module / question.
--    Invariants: correct + wrong <= graded <= total (a submission waiting for AI is only total).
-- =====================================================================
CREATE TABLE IF NOT EXISTS question_practice_progress (
    progress_id       BIGSERIAL    PRIMARY KEY,
    user_id           BIGINT       NOT NULL REFERENCES users (user_id) ON DELETE CASCADE,
    course_id         BIGINT       NOT NULL REFERENCES courses (course_id) ON DELETE CASCADE,
    module_id         BIGINT       NOT NULL REFERENCES modules (module_id) ON DELETE CASCADE,
    question_id       BIGINT       NOT NULL REFERENCES questions (question_id),
    total_attempts    INT          NOT NULL DEFAULT 0,
    graded_attempts   INT          NOT NULL DEFAULT 0,
    correct_attempts  INT          NOT NULL DEFAULT 0,
    wrong_attempts    INT          NOT NULL DEFAULT 0,
    last_is_correct   BOOLEAN,
    best_score        NUMERIC(5,2),
    mastery_status    VARCHAR(20)  NOT NULL DEFAULT 'NEW',
    first_answered_at TIMESTAMP,
    last_answered_at  TIMESTAMP,
    updated_at        TIMESTAMP    NOT NULL DEFAULT now()
);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_qpp_user_module_question') THEN
        ALTER TABLE question_practice_progress ADD CONSTRAINT uq_qpp_user_module_question
            UNIQUE (user_id, module_id, question_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_qpp_counts') THEN
        ALTER TABLE question_practice_progress ADD CONSTRAINT chk_qpp_counts
            CHECK (total_attempts >= 0 AND graded_attempts >= 0
                   AND correct_attempts >= 0 AND wrong_attempts >= 0
                   AND graded_attempts <= total_attempts
                   AND correct_attempts + wrong_attempts <= graded_attempts);
    END IF;
    -- Minimal, deterministic rule (no invented spaced-repetition model):
    --   NEW      = no finalized attempt yet
    --   MASTERED = the latest finalized attempt is correct
    --   LEARNING = finalized attempts exist and the latest one is not correct
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_qpp_mastery') THEN
        ALTER TABLE question_practice_progress ADD CONSTRAINT chk_qpp_mastery
            CHECK (mastery_status IN ('NEW', 'LEARNING', 'MASTERED'));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_qpp_user_module
    ON question_practice_progress (user_id, module_id);
CREATE INDEX IF NOT EXISTS idx_qpp_user_module_mastery
    ON question_practice_progress (user_id, module_id, mastery_status);
-- "last answered" ordering for the review-questions page.
CREATE INDEX IF NOT EXISTS idx_qpp_user_last_answered
    ON question_practice_progress (user_id, last_answered_at DESC);
