-- 1. Rename exam_questions.points to weight
ALTER TABLE exam_questions RENAME COLUMN points TO weight;
ALTER TABLE exam_questions ALTER COLUMN weight SET DEFAULT 1;
ALTER TABLE exam_questions DROP CONSTRAINT IF EXISTS chk_exam_questions_points_positive;
ALTER TABLE exam_questions DROP CONSTRAINT IF EXISTS chk_exam_questions_weight;
ALTER TABLE exam_questions ADD CONSTRAINT chk_exam_questions_weight CHECK (weight > 0);

-- 2. Rename exam_config.points_each to weight_each
ALTER TABLE exam_config RENAME COLUMN points_each TO weight_each;
ALTER TABLE exam_config DROP CONSTRAINT IF EXISTS chk_exam_config_weight_each;
ALTER TABLE exam_config ADD CONSTRAINT chk_exam_config_weight_each CHECK (weight_each IS NULL OR weight_each > 0);
