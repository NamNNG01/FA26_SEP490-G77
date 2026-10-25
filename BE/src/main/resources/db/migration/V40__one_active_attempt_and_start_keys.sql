-- V40__one_active_attempt_and_start_keys.sql
-- SA-01 idempotency (spec 6.1). grading_status/GRADING, grading_locked_at and grading_error are
-- already added by V39__ai_grading_queue_and_error (main), so this migration only adds the
-- single-active-attempt guarantee and the (userId, Idempotency-Key) lookup table.

-- 1. A student may only have one IN_PROGRESS attempt per exam.
--    Close duplicated legacy rows first so the partial unique index can be created:
--    the newest attempt stays IN_PROGRESS, older ones become auto-submitted.
WITH ranked AS (
    SELECT attempt_id,
           ROW_NUMBER() OVER (PARTITION BY user_id, exam_id
                              ORDER BY start_time DESC, attempt_id DESC) AS rn
    FROM exam_attempts
    WHERE status = 'IN_PROGRESS'
)
UPDATE exam_attempts a
SET status         = 'SUBMITTED',
    submitted_at   = COALESCE(a.submitted_at, now()),
    submit_time    = COALESCE(a.submit_time, now()),
    auto_submitted = true
FROM ranked r
WHERE a.attempt_id = r.attempt_id
  AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_attempt_one_active
    ON exam_attempts (user_id, exam_id)
    WHERE status = 'IN_PROGRESS';

-- 2. SA-01 idempotency: (user_id, key) -> attemptId, valid for 24 hours.
CREATE TABLE IF NOT EXISTS attempt_start_keys (
    id               BIGSERIAL PRIMARY KEY,
    user_id          BIGINT       NOT NULL REFERENCES users (user_id) ON DELETE CASCADE,
    idempotency_key  VARCHAR(128) NOT NULL,
    attempt_id       BIGINT       NOT NULL REFERENCES exam_attempts (attempt_id) ON DELETE CASCADE,
    created_at       TIMESTAMP    NOT NULL DEFAULT now(),
    expires_at       TIMESTAMP    NOT NULL,
    CONSTRAINT uq_attempt_start_key UNIQUE (user_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_attempt_start_keys_expires
    ON attempt_start_keys (expires_at);
