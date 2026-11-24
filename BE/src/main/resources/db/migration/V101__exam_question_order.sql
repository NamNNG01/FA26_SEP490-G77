ALTER TABLE exams
    ADD COLUMN IF NOT EXISTS question_order VARCHAR(20) NOT NULL DEFAULT 'RANDOM';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_exams_question_order'
    ) THEN
        ALTER TABLE exams
            ADD CONSTRAINT chk_exams_question_order CHECK (question_order IN ('MANUAL', 'RANDOM'));
    END IF;
END $$;
