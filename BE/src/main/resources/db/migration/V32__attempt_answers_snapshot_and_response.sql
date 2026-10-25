-- V32__attempt_answers_snapshot_and_response.sql

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'attempt_answers' AND column_name = 'display_snapshot') THEN
        ALTER TABLE attempt_answers ADD COLUMN display_snapshot JSONB;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'attempt_answers' AND column_name = 'key_snapshot') THEN
        ALTER TABLE attempt_answers ADD COLUMN key_snapshot JSONB;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'attempt_answers' AND column_name = 'draft_seq') THEN
        ALTER TABLE attempt_answers ADD COLUMN draft_seq INT NOT NULL DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'attempt_answers' AND column_name = 'weight_snapshot') THEN
        ALTER TABLE attempt_answers ADD COLUMN weight_snapshot NUMERIC(10,2) NOT NULL DEFAULT 1;
    END IF;
END $$;

-- 2. Backfill response from essay_answer (if response is NULL)
UPDATE attempt_answers
SET response = to_jsonb(essay_answer)
WHERE response IS NULL AND essay_answer IS NOT NULL;

-- 3. Backfill response from attempt_answer_options (if table exists and has rows, and response is NULL)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'attempt_answer_options') THEN
        UPDATE attempt_answers aa
        SET response = sub.opts_json
        FROM (
            SELECT ao.attempt_answer_id,
            jsonb_build_object('selectedOptionIds', jsonb_agg(ao.option_id ORDER BY ao.option_id)) as opts_json
            FROM attempt_answer_options ao
            GROUP BY ao.attempt_answer_id
        ) sub
        WHERE aa.attempt_answer_id = sub.attempt_answer_id AND aa.response IS NULL;
    END IF;
END $$;

-- 4. Backfill response from selected_option_id (if response is NULL)
UPDATE attempt_answers
SET response = jsonb_build_object('selectedOptionIds', jsonb_build_array(selected_option_id))
WHERE response IS NULL AND selected_option_id IS NOT NULL;

-- 5. Add unique constraint (attempt_id, question_id) if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'uq_attempt_question'
    ) THEN
        ALTER TABLE attempt_answers ADD CONSTRAINT uq_attempt_question UNIQUE (attempt_id, question_id);
    END IF;
END $$;
