ALTER TABLE questions DROP COLUMN IF EXISTS default_points;
UPDATE questions SET question_metadata = question_metadata - 'skillTag' WHERE question_metadata ? 'skillTag';
DROP INDEX IF EXISTS idx_q_skill;
