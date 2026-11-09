-- V79: Add duration_minutes to quiz_generation_jobs and take_as to exam_attempts.
ALTER TABLE quiz_generation_jobs ADD COLUMN IF NOT EXISTS duration_minutes INTEGER;
ALTER TABLE exam_attempts ADD COLUMN IF NOT EXISTS take_as VARCHAR(20);
