-- V65__fix_question_source_column.sql
ALTER TABLE questions ALTER COLUMN source TYPE VARCHAR(30);
