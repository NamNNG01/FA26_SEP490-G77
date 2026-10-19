-- V13__exams_updates.sql
ALTER TABLE exams ADD COLUMN IF NOT EXISTS published_at TIMESTAMP;
ALTER TABLE exam_config ADD COLUMN IF NOT EXISTS criteria JSONB;
