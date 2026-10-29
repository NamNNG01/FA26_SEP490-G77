-- V50__exam_attempt_mode_and_nullable_exam.sql
ALTER TABLE exam_attempts ALTER COLUMN exam_id DROP NOT NULL;
ALTER TABLE exam_attempts ADD COLUMN IF NOT EXISTS mode VARCHAR(30) NOT NULL DEFAULT 'NORMAL';
CREATE INDEX IF NOT EXISTS idx_exam_attempts_mode ON exam_attempts(mode);
