-- V76: Add is_locked and check_result to attempt_answers for practice exam check-answer
ALTER TABLE attempt_answers ADD COLUMN IF NOT EXISTS is_locked BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE attempt_answers ADD COLUMN IF NOT EXISTS check_result JSONB;
