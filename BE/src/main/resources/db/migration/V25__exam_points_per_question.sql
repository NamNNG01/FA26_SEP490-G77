-- 1. Add points_each to exam_config
ALTER TABLE exam_config ADD COLUMN IF NOT EXISTS points_each NUMERIC(6,2);
UPDATE exam_config SET points_each = 1 WHERE points_each IS NULL AND criteria IS NULL;

-- 2. Expand existing exam_groups into exam_questions
INSERT INTO exam_questions (exam_id, question_id, order_index, points)
SELECT eg.exam_id, q.question_id, (eg.order_index * 1000 + row_number() OVER (PARTITION BY eg.exam_id, eg.group_id ORDER BY q.question_id)),
       ROUND(eg.points / (SELECT COUNT(*) FROM questions q2 WHERE q2.group_id = eg.group_id AND q2.deleted_at IS NULL), 2)
FROM exam_groups eg
JOIN questions q ON q.group_id = eg.group_id AND q.deleted_at IS NULL
WHERE NOT EXISTS (
    SELECT 1 FROM exam_questions eq WHERE eq.exam_id = eg.exam_id AND eq.question_id = q.question_id
);

-- 3. Add unique constraint on (exam_id, question_id) for exam_questions
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'uq_exam_question'
    ) THEN
        ALTER TABLE exam_questions ADD CONSTRAINT uq_exam_question UNIQUE (exam_id, question_id);
    END IF;
END $$;

-- 4. Ensure exam_questions points are not null and positive
UPDATE exam_questions SET points = COALESCE(points, 1.00) WHERE points IS NULL;
ALTER TABLE exam_questions ALTER COLUMN points SET NOT NULL;
ALTER TABLE exam_questions DROP CONSTRAINT IF EXISTS chk_exam_questions_points_positive;
ALTER TABLE exam_questions ADD CONSTRAINT chk_exam_questions_points_positive CHECK (points > 0);

-- 5. Add max_score to exams
ALTER TABLE exams ADD COLUMN IF NOT EXISTS max_score NUMERIC(6,2);
UPDATE exams e SET max_score = COALESCE((SELECT SUM(points) FROM exam_questions eq WHERE eq.exam_id = e.exam_id), 100.00) WHERE max_score IS NULL;
ALTER TABLE exams ALTER COLUMN max_score SET NOT NULL;
ALTER TABLE exams DROP CONSTRAINT IF EXISTS chk_exams_max_score_positive;
ALTER TABLE exams ADD CONSTRAINT chk_exams_max_score_positive CHECK (max_score > 0);
