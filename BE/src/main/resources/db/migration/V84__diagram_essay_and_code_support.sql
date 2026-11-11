-- V84__diagram_essay_and_code_support.sql

ALTER TABLE questions DROP CONSTRAINT IF EXISTS chk_question_type;
ALTER TABLE questions ADD CONSTRAINT chk_question_type CHECK (question_type IN (
    'SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'TRUE_FALSE', 'FILL_BLANK', 'MATCHING',
    'ORDERING', 'ESSAY', 'DIAGRAM', 'DIAGRAM_ESSAY', 'CODE'
));

ALTER TABLE question_groups DROP CONSTRAINT IF EXISTS chk_question_group_type;
ALTER TABLE question_groups ADD CONSTRAINT chk_question_group_type
    CHECK (question_type IS NULL OR question_type IN ('QUIZ', 'ESSAY', 'CODE', 'DIAGRAM', 'DIAGRAM_ESSAY'));
