-- V14__add_question_creator.sql
ALTER TABLE questions ADD COLUMN IF NOT EXISTS created_by BIGINT REFERENCES users(user_id) ON DELETE SET NULL;
UPDATE questions SET created_by = (SELECT MIN(user_id) FROM users) WHERE created_by IS NULL;
