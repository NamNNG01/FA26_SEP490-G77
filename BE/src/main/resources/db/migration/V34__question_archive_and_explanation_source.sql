-- V34__question_archive_and_explanation_source.sql

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'questions' AND column_name = 'replaced_by') THEN
        ALTER TABLE questions ADD COLUMN replaced_by BIGINT REFERENCES questions(question_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'questions' AND column_name = 'archived_at') THEN
        ALTER TABLE questions ADD COLUMN archived_at TIMESTAMP;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'questions' AND column_name = 'ai_explanation_source') THEN
        ALTER TABLE questions ADD COLUMN ai_explanation_source VARCHAR(10);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'questions' AND column_name = 'ai_explanation_version') THEN
        ALTER TABLE questions ADD COLUMN ai_explanation_version INT;
    END IF;
END $$;

-- Update explanation source and clean up empty explanations
UPDATE questions
SET ai_explanation_source = 'MANAGER'
WHERE ai_explanation IS NOT NULL AND ai_explanation <> '' AND ai_explanation_source IS NULL;

UPDATE questions
SET ai_explanation = NULL
WHERE ai_explanation = '';

-- Add constraints if not exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_explanation_source') THEN
        ALTER TABLE questions ADD CONSTRAINT chk_explanation_source CHECK (ai_explanation_source IS NULL OR ai_explanation_source IN ('MANAGER','AI'));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_question_status') THEN
        ALTER TABLE questions ADD CONSTRAINT chk_question_status CHECK (status IN ('ACTIVE','INACTIVE','DRAFT','ARCHIVED'));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_question_type') THEN
        ALTER TABLE questions ADD CONSTRAINT chk_question_type CHECK (question_type IN ('SINGLE_CHOICE','MULTIPLE_CHOICE','TRUE_FALSE','MATCHING','FILL_BLANK','ESSAY','DIAGRAM','ORDERING'));
    END IF;
END $$;
