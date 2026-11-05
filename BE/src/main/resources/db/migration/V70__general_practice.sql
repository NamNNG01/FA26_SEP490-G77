-- V70__general_practice.sql
-- Module Practice for a course's "General" pool: the questions of a course that are filed under no
-- module (questions.course_id = :courseId AND questions.module_id IS NULL).
--
-- V68 created both practice tables with module_id NOT NULL, so a General run had nowhere to live but
-- a module. This migration only relaxes that; course_id was already NOT NULL on both tables (V68),
-- so no backfill is needed. It also adds the uniqueness the module constraints cannot express:
-- PostgreSQL treats NULLs as distinct, so neither uq_qps_one_active nor uq_qpp_user_module_question
-- ever compares two General rows.
--
-- Additive and idempotent; nothing existing is dropped or rewritten.

-- =====================================================================
-- 1. QUESTION_PRACTICE_SESSIONS — a General run is a session with module_id NULL.
-- =====================================================================
ALTER TABLE question_practice_sessions ALTER COLUMN module_id DROP NOT NULL;

-- One open General run per (student, course); module runs keep uq_qps_one_active (V68).
-- Closing the session is still the only way to start another one.
CREATE UNIQUE INDEX IF NOT EXISTS uq_qps_one_active_general
    ON question_practice_sessions (user_id, course_id)
    WHERE status = 'IN_PROGRESS' AND module_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_qps_user_course_general
    ON question_practice_sessions (user_id, course_id)
    WHERE module_id IS NULL;

-- =====================================================================
-- 2. QUESTION_PRACTICE_PROGRESS — the General pool keeps its own rows.
--    uq_qpp_user_module_question (V68) stays the rule for module rows; this one is the rule for a
--    question that is not filed under a module, keyed by the course it belongs to.
-- =====================================================================
ALTER TABLE question_practice_progress ALTER COLUMN module_id DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_qpp_user_course_question_general
    ON question_practice_progress (user_id, course_id, question_id)
    WHERE module_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_qpp_user_course_general
    ON question_practice_progress (user_id, course_id)
    WHERE module_id IS NULL;
