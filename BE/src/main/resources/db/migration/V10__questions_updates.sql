-- V10__questions_updates.sql
ALTER TABLE questions
  ADD COLUMN IF NOT EXISTS course_id BIGINT REFERENCES courses(course_id),
  ADD COLUMN IF NOT EXISTS answer_key JSONB,
  ADD COLUMN IF NOT EXISTS default_points NUMERIC(5,2) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS source VARCHAR(10) NOT NULL DEFAULT 'MANUAL' CHECK (source IN ('MANUAL','AI','IMPORT')),
  ADD COLUMN IF NOT EXISTS creator_role VARCHAR(10) NOT NULL DEFAULT 'MANAGER' CHECK (creator_role IN ('MANAGER','STUDENT')),
  ADD COLUMN IF NOT EXISTS ai_usage_log_id BIGINT REFERENCES ai_usage_logs(log_id),
  ADD COLUMN IF NOT EXISTS source_document_id BIGINT REFERENCES documents(doc_id),
  ADD COLUMN IF NOT EXISTS source_excerpt TEXT,
  ADD COLUMN IF NOT EXISTS content_hash CHAR(64),
  ADD COLUMN IF NOT EXISTS scoring_version INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS lock_version BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;

-- Backfill course_id from module_id or group_id if course_id is null
UPDATE questions q
SET course_id = m.course_id
FROM modules m
WHERE q.module_id = m.module_id AND q.course_id IS NULL;

UPDATE questions q
SET course_id = g.course_id
FROM question_groups g
WHERE q.group_id = g.group_id AND q.course_id IS NULL AND g.course_id IS NOT NULL;

-- Safe JSONB conversion for question_metadata and essay_grading_rubric
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'questions' AND column_name = 'question_metadata') THEN
        ALTER TABLE questions ALTER COLUMN question_metadata TYPE JSONB USING
            CASE
                WHEN question_metadata IS NULL THEN NULL
                WHEN question_metadata::text ~ '^\s*\{.*\}\s*$' OR question_metadata::text ~ '^\s*\[.*\]\s*$' THEN question_metadata::text::jsonb
                ELSE NULL
            END;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'questions' AND column_name = 'essay_grading_rubric') THEN
        ALTER TABLE questions ALTER COLUMN essay_grading_rubric TYPE JSONB USING
            CASE
                WHEN essay_grading_rubric IS NULL THEN NULL
                WHEN essay_grading_rubric::text ~ '^\s*\{.*\}\s*$' OR essay_grading_rubric::text ~ '^\s*\[.*\]\s*$' THEN essay_grading_rubric::text::jsonb
                ELSE NULL
            END;
    END IF;
END $$;

-- Map legacy question_type values
UPDATE questions SET question_type = 'SINGLE_CHOICE' WHERE question_type IN ('mcq', 'SINGLE');
UPDATE questions SET question_type = 'TRUE_FALSE' WHERE question_type IN ('TrueFalse', 'TF');
UPDATE questions SET question_type = 'ESSAY' WHERE question_type IN ('Essay');

-- Map legacy difficulty values
UPDATE questions SET difficulty = 'MEDIUM' WHERE difficulty IS NULL OR difficulty NOT IN ('EASY', 'MEDIUM', 'HARD', 'ANY');

-- Map status and approval_status
ALTER TABLE questions ADD COLUMN IF NOT EXISTS approval_status VARCHAR(20) NOT NULL DEFAULT 'APPROVED' CHECK (approval_status IN ('PENDING','APPROVED','REJECTED'));
UPDATE questions SET status = 'ACTIVE' WHERE status IS NULL OR status NOT IN ('ACTIVE', 'INACTIVE', 'DRAFT');

-- Add CHECK constraints for question_type
ALTER TABLE questions DROP CONSTRAINT IF EXISTS chk_question_type;
ALTER TABLE questions ADD CONSTRAINT chk_question_type CHECK (question_type IN ('SINGLE_CHOICE','MULTIPLE_CHOICE','TRUE_FALSE','MATCHING','FILL_BLANK','ESSAY','CODE','DIAGRAM'));

-- Indexes
CREATE INDEX IF NOT EXISTS idx_q_bank ON questions(course_id, question_type, difficulty, status, approval_status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_q_hash ON questions(course_id, content_hash);
CREATE INDEX IF NOT EXISTS idx_q_skill ON questions((question_metadata->>'skillTag')) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_q_content_trgm ON questions USING GIN (content gin_trgm_ops);

-- Answer options explanation
ALTER TABLE answer_options ADD COLUMN IF NOT EXISTS explanation TEXT;
