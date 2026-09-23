-- V3__add_enrollment_progress.sql
-- Add course completion progress (0-100) to enrollments for dashboard reporting

ALTER TABLE enrollments
    ADD COLUMN IF NOT EXISTS progress INT NOT NULL DEFAULT 0;
