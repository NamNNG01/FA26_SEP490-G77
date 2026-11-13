-- V85__question_regrade_job_key_snapshot.sql
-- Freeze the answer key at job creation so later corrections cannot change what a pending job regrades.

ALTER TABLE question_regrade_jobs ADD COLUMN IF NOT EXISTS key_snapshot JSONB;
