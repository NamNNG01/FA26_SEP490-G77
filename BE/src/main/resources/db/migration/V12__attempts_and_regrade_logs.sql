-- V12__attempts_and_regrade_logs.sql
ALTER TABLE attempt_answers
  ADD COLUMN IF NOT EXISTS response JSONB,
  ADD COLUMN IF NOT EXISTS question_version INT DEFAULT 1,
  ADD COLUMN IF NOT EXISTS grading_status VARCHAR(15) NOT NULL DEFAULT 'AUTO' CHECK (grading_status IN ('AUTO','PENDING_AI','AI_GRADED','FAILED')),
  ADD COLUMN IF NOT EXISTS ai_criteria_scores JSONB,
  ADD COLUMN IF NOT EXISTS ai_feedback_json JSONB,
  ADD COLUMN IF NOT EXISTS grade_retry_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS graded_at TIMESTAMP;

-- Ensure ai_usage_logs has FK to attempt_answers (PK is answer_id in V1)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_ai_log_answer') THEN
       ALTER TABLE ai_usage_logs ADD CONSTRAINT fk_ai_log_answer
       FOREIGN KEY (attempt_answer_id)
       REFERENCES attempt_answers(attempt_answer_id);
    END IF;
END $$;

ALTER TABLE exam_attempts ADD COLUMN IF NOT EXISTS status VARCHAR(15) NOT NULL DEFAULT 'IN_PROGRESS' CHECK (status IN ('IN_PROGRESS','GRADING','COMPLETED'));
UPDATE exam_attempts SET status = 'COMPLETED' WHERE submit_time IS NOT NULL AND status = 'IN_PROGRESS';

CREATE TABLE IF NOT EXISTS answer_regrade_logs (
  id BIGSERIAL PRIMARY KEY,
  attempt_answer_id BIGINT NOT NULL REFERENCES attempt_answers(attempt_answer_id) ON DELETE CASCADE,
  old_score NUMERIC(5,2),
  new_score NUMERIC(5,2),
  question_version_from INT,
  question_version_to INT,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_aa_regrade ON attempt_answers(question_id, question_version) WHERE grading_status = 'AUTO' AND response IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_aa_pending_ai ON attempt_answers(grading_status) WHERE grading_status = 'PENDING_AI';
