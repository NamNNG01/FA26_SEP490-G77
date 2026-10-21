-- Each question group holds a single question kind; MIXED is intentionally not allowed.
ALTER TABLE question_groups ADD COLUMN IF NOT EXISTS question_type VARCHAR(20);

-- Backfill from the questions already in the group: only groups whose active
-- questions share one kind get a value; mixed groups stay NULL for a manager to set.
UPDATE question_groups g
SET question_type = d.kind
FROM (
    SELECT q.group_id,
           CASE WHEN COUNT(DISTINCT CASE
                        WHEN q.question_type IN ('ESSAY', 'CODE', 'DIAGRAM') THEN q.question_type
                        ELSE 'QUIZ' END) = 1
                THEN MIN(CASE
                        WHEN q.question_type IN ('ESSAY', 'CODE', 'DIAGRAM') THEN q.question_type
                        ELSE 'QUIZ' END)
           END AS kind
    FROM questions q
    WHERE q.group_id IS NOT NULL AND q.deleted_at IS NULL
    GROUP BY q.group_id
) d
WHERE g.group_id = d.group_id AND g.question_type IS NULL;

ALTER TABLE question_groups DROP CONSTRAINT IF EXISTS chk_question_group_type;
ALTER TABLE question_groups ADD CONSTRAINT chk_question_group_type
    CHECK (question_type IS NULL OR question_type IN ('QUIZ', 'ESSAY', 'CODE', 'DIAGRAM'));
