-- V72__exam_contest_mode.sql
-- A manager can now mark a course exam as CONTEST (exams.mode). Contest exams are the only ones API 11 offers
-- and API 3/4 accept; students' course exam lists and progress keep reading mode = 'EXAM', so contest exams
-- stay hidden there and are taken only through their contest.

ALTER TABLE exams DROP CONSTRAINT IF EXISTS chk_exam_mode;
ALTER TABLE exams ADD CONSTRAINT chk_exam_mode CHECK (mode IN ('EXAM', 'CONTEST', 'PRACTICE', 'SMART_PRACTICE', 'MATERIAL_QUIZ'));

-- Exams already held by a contest become contest exams, so those contests stay editable.
UPDATE exams SET mode = 'CONTEST'
WHERE mode = 'EXAM' AND exam_id IN (SELECT exam_id FROM contests WHERE deleted_at IS NULL);
