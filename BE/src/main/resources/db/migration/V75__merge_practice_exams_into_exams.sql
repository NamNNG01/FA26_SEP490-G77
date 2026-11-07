-- V75: Merge practice_exams into exams (mode PRACTICE_EXAM), add practice_config, drop is_practice.
--
-- Gap: practice-exam-merge-into-exams-be-gap-2026-11-07.md

-- 1a. New mode PRACTICE_EXAM: widen both CHECK constraints --------------------------

ALTER TABLE exams DROP CONSTRAINT IF EXISTS chk_exam_mode;
ALTER TABLE exams ADD CONSTRAINT chk_exam_mode
    CHECK (mode IN ('EXAM', 'CONTEST', 'PRACTICE', 'PRACTICE_EXAM', 'SMART_PRACTICE', 'MATERIAL_QUIZ'));

ALTER TABLE exam_attempts DROP CONSTRAINT IF EXISTS chk_ea_mode;
ALTER TABLE exam_attempts ADD CONSTRAINT chk_ea_mode
    CHECK (mode IN ('EXAM', 'CONTEST', 'PRACTICE', 'PRACTICE_EXAM', 'REVIEW', 'MATERIAL_QUIZ', 'SMART_PRACTICE'));

-- Backfill mode for PQ-01 exams that were linked from practice_exams ----------------

UPDATE exams e SET mode = 'PRACTICE_EXAM'
FROM practice_exams p WHERE p.exam_id = e.exam_id AND e.mode = 'PRACTICE';

UPDATE exam_attempts a SET mode = 'PRACTICE_EXAM'
FROM exams e WHERE a.exam_id = e.exam_id AND e.mode = 'PRACTICE_EXAM' AND a.mode = 'PRACTICE';

-- 1b. practice_config column --------------------------------------------------------

ALTER TABLE exams ADD COLUMN IF NOT EXISTS practice_config jsonb;

-- Backfill practice_config from practice_exams data
UPDATE exams e SET practice_config = jsonb_build_object(
    'examType', CASE WHEN e.title LIKE '%Tự luận%' THEN 'ESSAY' ELSE 'QUIZ' END,
    'questionCount', p.question_count,
    'difficulty', p.difficulty,
    'moduleIds', COALESCE(p.category_ids, '[]'::jsonb)
)
FROM practice_exams p WHERE p.exam_id = e.exam_id;

-- Drop the cross-reference columns and the practice_exams table ---------------------

ALTER TABLE exams DROP CONSTRAINT IF EXISTS exams_practice_exam_id_fkey;
ALTER TABLE exams DROP COLUMN IF EXISTS practice_exam_id;

DROP TABLE IF EXISTS practice_exams;

-- Index for PQ-02 list query --------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_exams_owner_mode ON exams (created_by, mode, created_at DESC);

-- CHECK: PRACTICE_EXAM must have practice_config -----------------------------------

ALTER TABLE exams ADD CONSTRAINT chk_practice_exam_config
    CHECK (mode <> 'PRACTICE_EXAM' OR practice_config IS NOT NULL);

-- 4. Drop is_practice (source of truth is mode) ------------------------------------

ALTER TABLE exams DROP COLUMN IF EXISTS is_practice;
