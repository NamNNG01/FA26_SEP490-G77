-- V73__quiz_job_title_context.sql
-- MQ-03 keeps the quiz name and AI guidance the student typed until the worker builds the exam.
ALTER TABLE quiz_generation_jobs ADD COLUMN IF NOT EXISTS title VARCHAR(255);
ALTER TABLE quiz_generation_jobs ADD COLUMN IF NOT EXISTS context VARCHAR(2000);
