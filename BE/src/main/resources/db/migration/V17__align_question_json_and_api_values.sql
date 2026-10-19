-- Forward alignment only: V9-V16 are already occupied in the shared database.
ALTER TABLE questions ALTER COLUMN question_metadata TYPE JSONB USING question_metadata::jsonb;
ALTER TABLE questions ALTER COLUMN essay_grading_rubric TYPE JSONB USING essay_grading_rubric::jsonb;

ALTER TABLE questions DROP CONSTRAINT IF EXISTS chk_question_type;
UPDATE questions SET question_type = CASE question_type
    WHEN 'MULTIPLE_CHOICE' THEN 'MULTI_CHOICE'
    WHEN 'FILL_IN_BLANK' THEN 'FILL_BLANK'
    ELSE question_type END
WHERE question_type IN ('MULTIPLE_CHOICE', 'FILL_IN_BLANK');
ALTER TABLE questions ADD CONSTRAINT chk_question_type CHECK (question_type IN (
    'SINGLE_CHOICE', 'MULTI_CHOICE', 'TRUE_FALSE', 'FILL_BLANK', 'MATCHING',
    'ORDERING', 'ESSAY', 'CODE', 'DIAGRAM'
));

UPDATE exam_config SET question_type = CASE question_type
    WHEN 'MULTIPLE_CHOICE' THEN 'MULTI_CHOICE'
    WHEN 'FILL_IN_BLANK' THEN 'FILL_BLANK'
    ELSE question_type END
WHERE question_type IN ('MULTIPLE_CHOICE', 'FILL_IN_BLANK');

UPDATE exams SET generation_type = 'STATIC' WHERE generation_type = 'FIXED';
ALTER TABLE exams ALTER COLUMN generation_type SET DEFAULT 'STATIC';
