-- V36__exam_question_unique.sql

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_exam_question') THEN
        ALTER TABLE exam_questions ADD CONSTRAINT uq_exam_question UNIQUE (exam_id, question_id);
    END IF;
END $$;
