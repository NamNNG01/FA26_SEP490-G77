-- V77: Allow duration_minutes to be NULL for PRACTICE-mode exams.
-- EXAM and CONTEST modes still require a value (enforced at application layer).
-- Existing rows already carry a value; no backfill is needed.

ALTER TABLE exams ALTER COLUMN duration_minutes DROP NOT NULL;
