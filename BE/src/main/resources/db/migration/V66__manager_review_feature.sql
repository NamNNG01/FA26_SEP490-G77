-- V64__manager_review_feature.sql
-- 1. Optimistic lock
ALTER TABLE question_contributions ADD COLUMN IF NOT EXISTS version BIGINT NOT NULL DEFAULT 0;
ALTER TABLE decks ADD COLUMN IF NOT EXISTS version BIGINT NOT NULL DEFAULT 0;

-- 2. Resubmission count for decks
ALTER TABLE decks ADD COLUMN IF NOT EXISTS resubmission_count INT NOT NULL DEFAULT 0;

-- 3. Review logs for contributions and decks
CREATE TABLE IF NOT EXISTS review_logs (
  log_id       BIGSERIAL   PRIMARY KEY,
  target_type  VARCHAR(30) NOT NULL,   -- QUESTION_CONTRIBUTION | DECK
  target_id    BIGINT      NOT NULL,
  reviewer_id  BIGINT      NOT NULL,
  decision     VARCHAR(20) NOT NULL,   -- APPROVED | REJECTED
  note         TEXT,
  created_at   TIMESTAMP   NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')
);
CREATE INDEX IF NOT EXISTS idx_review_logs_target ON review_logs(target_type, target_id);

-- 4. Indexes for review list screens
CREATE INDEX IF NOT EXISTS idx_qc_status_course
  ON question_contributions(status, course_id, submitted_at);
CREATE INDEX IF NOT EXISTS idx_decks_review
  ON decks(review_status, course_id, submitted_at);
