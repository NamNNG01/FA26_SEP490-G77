-- V7__srs_alignment.sql
-- Iteration 1 (scope decision b): add decks.description only (SRS 3.7
-- Flashcard Detail requires a deck description; the decks table has none).
--
-- NOTE (scope decision): the earlier V7 draft also contained
-- courses.difficulty, decks.updated_at and saved_questions. Those were
-- dropped by team decision and deferred to Iteration 2 together with the
-- screens that need them (Public Courses filter, deck last-updated label,
-- mistake notebook). This file intentionally contains ONE additive,
-- idempotent statement so Flyway applies cleanly on fresh and existing
-- databases. Never edit V1-V6.

ALTER TABLE decks ADD COLUMN IF NOT EXISTS description TEXT;
